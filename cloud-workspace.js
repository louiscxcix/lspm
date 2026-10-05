(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CloudWorkspace = api;
})(globalThis, function () {
  function initialWorkspace(projects, localWorkspace) {
    if (projects.length) return {source: 'cloud', workspace: {version: 2, projects}};
    if (localWorkspace?.projects?.length) return {source: 'migration', workspace: localWorkspace};
    return {source: 'empty', workspace: {version: 2, projects: []}};
  }
  return {initialWorkspace};
});
