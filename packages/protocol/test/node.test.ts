import { execFileSync } from "node:child_process";
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve,join,basename } from "node:path";
import { expect,it } from "vitest";
import { assertBuildUnchanged,readBuildIdentity,runtimeEnvironment,validateEnvironment } from "../src/node.js";

it("REPLAY-01: actual clean/dirty/development producer identities and drift detection",()=>{
  const root=mkdtempSync(join(tmpdir(),"li4chess-provenance-"));
  const git=(...args:string[])=>execFileSync("git",args,{cwd:root,encoding:"utf8",windowsHide:true});
  try {
    // CI may have no configured identity; preserve the checked-out human author.
    const identity=(key:string,format:string)=>{
      try { return execFileSync("git",["config",key],{encoding:"utf8",windowsHide:true}).trim(); }
      catch { return execFileSync("git",["log","-1",`--format=${format}`],{encoding:"utf8",windowsHide:true}).trim(); }
    };
    const name=identity("user.name","%an"),email=identity("user.email","%ae");
    git("init","--quiet");git("config","user.name",name);git("config","user.email",email);
    for (const pkg of ["engine","protocol"]) {
      mkdirSync(join(root,"packages",pkg),{recursive:true});
      writeFileSync(join(root,"packages",pkg,"package.json"),JSON.stringify({name:`@li4chess/${pkg}`,version:"0.0.0"}));
    }
    git("add",".");git("-c","commit.gpgsign=false","commit","--quiet","-m","Provenance test fixture");
    const clean=readBuildIdentity(root);
    expect(clean.sourceRevision).toBe(git("rev-parse","HEAD").trim());
    expect(clean.workingTree.status).toBe("clean");
    expect(()=>assertBuildUnchanged(clean,root)).not.toThrow();
    writeFileSync(join(root,"uncommitted.txt"),"Untracked input must change the content digest");
    const dirty=readBuildIdentity(root);
    expect(dirty.workingTree).toEqual({status:"dirty",contentHash:dirty.buildFingerprint});
    expect(dirty.buildFingerprint).not.toBe(clean.buildFingerprint);
    expect(()=>assertBuildUnchanged(clean,root)).toThrow(/changed/);
    expect(()=>assertBuildUnchanged(dirty,root)).not.toThrow();
    expect(readBuildIdentity(root,true).workingTree).toMatchObject({status:"unreproducible"});
    expect(()=>validateEnvironment(runtimeEnvironment())).not.toThrow();
    for (const env of [{},{...runtimeEnvironment(),cpu:""},{...runtimeEnvironment(),logicalCpus:0}]) expect(()=>validateEnvironment(env)).toThrow();
  } finally {
    const resolved=resolve(root),temporary=resolve(tmpdir());
    if (!resolved.startsWith(temporary+"\\") && !resolved.startsWith(temporary+"/")) throw new Error("Unsafe fixture cleanup path");
    if (!basename(resolved).startsWith("li4chess-provenance-")) throw new Error("Unsafe fixture directory");
    rmSync(resolved,{recursive:true,force:true});
  }
});
