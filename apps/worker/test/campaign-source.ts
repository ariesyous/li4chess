import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";

type FileRecord={path:string;blob?:string;byteLength:number;sha256:string} &
  ({mode:"identity"|"crlf"}|{mode:"inline";base64:string}|{mode:"deleted"});
export interface SourceMap {format:"li4chess-source-map-v1";producer:EngineBuildIdentityV1;files:FileRecord[]}
const hash=(bytes:Buffer)=>`sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const git=(root:string,args:string[],input?:string)=>execFileSync("git",args,{cwd:root,windowsHide:true,input,maxBuffer:256*1024*1024});
function tree(root:string,revision:string):Map<string,string> {
  assert(/^[0-9a-f]{40,64}$/.test(revision),"source revision must be a full Git object ID");
  const result=new Map<string,string>();
  for(const entry of git(root,["ls-tree","-rz","--full-tree",revision]).toString("utf8").split("\0").filter(Boolean)) {
    const tab=entry.indexOf("\t"),fields=entry.slice(0,tab).split(" ");
    assert(tab>0&&fields[1]==="blob","source tree must contain blobs only");result.set(entry.slice(tab+1),fields[2]);
  }
  return result;
}
/** One process and one batch for all immutable baseline content. */
function blobs(root:string,ids:string[]):Map<string,Buffer> {
  const unique=[...new Set(ids)].sort();if(!unique.length)return new Map();
  for(const id of unique)assert(/^[0-9a-f]{40,64}$/.test(id));
  const output=git(root,["cat-file","--batch"],`${unique.join("\n")}\n`),result=new Map<string,Buffer>();let offset=0;
  for(const id of unique) {
    const end=output.indexOf(10,offset);assert(end>=offset,"missing batch header");
    const [actual,type,size]=output.subarray(offset,end).toString("ascii").split(" ");
    assert.equal(actual,id);assert.equal(type,"blob");assert(/^\d+$/.test(size));const length=Number(size);
    assert(Number.isSafeInteger(length)&&end+1+length<output.length,"invalid batch length");
    offset=end+1;result.set(id,output.subarray(offset,offset+length));offset+=length;assert.equal(output[offset++],10);
  }
  assert.equal(offset,output.length,"trailing batch content");return result;
}
function crlf(bytes:Buffer):Buffer {
  const utf8=bytes.toString("utf8");assert(Buffer.from(utf8).equals(bytes),"CRLF conversion requires exact UTF-8");
  return Buffer.from(utf8.replace(/(?<!\r)\n/g,"\r\n"));
}
function fingerprint(files:FileRecord[],content:Map<string,Buffer>):string {
  const digest=createHash("sha256");
  for(const file of files) {
    digest.update(file.path).update("\0");
    if(file.mode==="deleted") {assert.equal(file.byteLength,0);assert.equal(file.sha256,hash(Buffer.alloc(0)));digest.update("deleted\0");}
    else {
      const bytes=content.get(file.path);assert(bytes,"missing reconstructed file");
      assert.equal(bytes.length,file.byteLength);assert.equal(hash(bytes),file.sha256);
      digest.update(String(bytes.length)).update("\0").update(bytes);
    }
  }
  return `sha256:${digest.digest("hex")}`;
}
export async function captureSourceMap(root:string,output:string,producer:EngineBuildIdentityV1):Promise<SourceMap> {
  assert.equal(git(root,["rev-parse","HEAD"]).toString("utf8").trim(),producer.sourceRevision);
  const paths=[...new Set(git(root,["ls-files","-z","--cached","--others","--exclude-standard"]).toString("utf8").split("\0").filter(Boolean))].sort();
  const baseline=tree(root,producer.sourceRevision),objects=blobs(root,paths.flatMap(path=>baseline.has(path)?[baseline.get(path)!]:[]));
  const files:FileRecord[]=[],content=new Map<string,Buffer>();
  for(const path of paths) {
    const blob=baseline.get(path),common={path,...(blob?{blob}:{})};let bytes:Buffer;
    try {bytes=await readFile(resolve(root,path));}catch(error) {
      if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;
      files.push({...common,mode:"deleted",byteLength:0,sha256:hash(Buffer.alloc(0))});continue;
    }
    content.set(path,bytes);const details={...common,byteLength:bytes.length,sha256:hash(bytes)},base=blob?objects.get(blob):undefined;
    if(base?.equals(bytes))files.push({...details,mode:"identity"});
    else {
      let converted=false;try {converted=!!base&&crlf(base).equals(bytes);}catch {/* Binary content is stored exactly. */}
      files.push(converted?{...details,mode:"crlf"}:{...details,mode:"inline",base64:bytes.toString("base64")});
    }
  }
  assert.equal(fingerprint(files,content),producer.buildFingerprint,"source changed since artifact build");
  const map:SourceMap={format:"li4chess-source-map-v1",producer,files};
  await writeFile(resolve(output,"source-map.json.gz"),gzipSync(JSON.stringify(map)),{flag:"wx"});return map;
}
/** Verifies retained bytes against Git objects; does not trust checkout line endings. */
export async function verifySourceMap(root:string,path:string):Promise<SourceMap> {
  const map=JSON.parse(gunzipSync(await readFile(path)).toString("utf8")) as SourceMap;
  assert.equal(map.format,"li4chess-source-map-v1");assert(Array.isArray(map.files));
  assert.deepEqual(map.files.map(file=>file.path),[...new Set(map.files.map(file=>file.path))].sort(),"source paths must be unique and sorted");
  const baseline=tree(root,map.producer.sourceRevision),objects=blobs(root,map.files.flatMap(file=>file.blob?[file.blob]:[])),content=new Map<string,Buffer>();
  for(const file of map.files) {
    assert(typeof file.path==="string"&&!file.path.includes("\0"));
    assert.equal(file.blob,baseline.get(file.path),"baseline path/blob association");
    if(file.mode==="deleted")continue;
    let bytes:Buffer;
    if(file.mode==="inline") {assert(typeof file.base64==="string");bytes=Buffer.from(file.base64,"base64");assert.equal(bytes.toString("base64"),file.base64);}
    else {
      assert(file.mode==="identity"||file.mode==="crlf");assert(file.blob);const base=objects.get(file.blob);assert(base);
      bytes=file.mode==="identity"?base:crlf(base);
    }
    content.set(file.path,bytes);
  }
  assert.equal(fingerprint(map.files,content),map.producer.buildFingerprint,"reconstructed producer fingerprint");return map;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  assert.equal(process.argv[2],"verify","usage: tsx campaign-source.ts verify <repository> <source-map.json.gz>");
  const map=await verifySourceMap(resolve(process.argv[3]),resolve(process.argv[4]));
  console.log(`Verified ${map.files.length} source files: ${map.producer.buildFingerprint}`);
}
