// The build command supplies this immutable module before Wrangler runs.
declare module "*build.json" {
  const build: {
    producer: import("@li4chess/protocol").EngineBuildIdentityV1;
    target: "workers";
    basePath: "/";
  };
  export default build;
}
