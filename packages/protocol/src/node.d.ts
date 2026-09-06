import type { EngineBuildIdentityV1 } from "./types.js";
export function readBuildIdentity(root?:string,development?:boolean):EngineBuildIdentityV1;
export function runtimeEnvironment():{node:string;platform:string;release:string;architecture:string;cpu:string;logicalCpus:number;totalMemoryBytes:number};
export function createRunDirectory(path:string):void;
export function assertBuildUnchanged(producer:EngineBuildIdentityV1,root?:string):void;
export function validateEnvironment(value:unknown):void;
