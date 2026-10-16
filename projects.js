(function (root) {
  const M = typeof module === "object" ? require("./ontology-model.js") : root.OntologyModel;
  const KEY = "pm-process-twin-projects-v2";
  const LEGACY = "pm-process-twin-ontology-v1";
  const copy = value => JSON.parse(JSON.stringify(value));
  const uid = () => "project-" + crypto.randomUUID();
  function create(name) {
    if (typeof name !== "string" || !name.trim() || name.length > 120) throw Error("Project name must contain 1–120 characters.");
    return { id: uid(), name: name.trim(), status: "active", createdAt: new Date().toISOString(), version: 2, entities: [], relations: [] };
  }
  function validate(project) {
    if (!project || project.version !== 2 || typeof project.id !== "string" || !project.id || !["active", "archived"].includes(project.status)) throw Error("Invalid project file.");
    if (typeof project.name !== "string" || !project.name.trim() || project.name.length > 120) throw Error("Invalid project name.");
    const graph = M.validateStore(project);
    if (graph.entities.some(e => e.type === "Project")) throw Error("Projects belong outside the graph.");
    for (const item of [...graph.entities, ...graph.relations]) {
      if (item.projectId !== project.id) throw Error("Cross-project record rejected.");
    }
    return copy(project);
  }
  function migrate(graph) {
    graph = M.validateStore(graph);
    const roots = graph.entities.filter(e => e.type === "Project");
    const project = create(roots.length === 1 ? roots[0].name : "Imported legacy workspace");
    const rootIds = new Set(roots.map(e => e.id));
    project.legacyProjectRecords = roots;
    project.legacyProjectRelations = graph.relations.filter(r => rootIds.has(r.from) || rootIds.has(r.to));
    project.entities = graph.entities.filter(e => !rootIds.has(e.id)).map(e => ({...e, projectId: project.id}));
    project.relations = graph.relations.filter(r => !rootIds.has(r.from) && !rootIds.has(r.to)).map(r => ({...r, projectId: project.id}));
    return validate(project);
  }
  function validateWorkspace(value) {
    if (!value || value.version !== 2 || !Array.isArray(value.projects)) throw Error("Invalid workspace. Export existing browser data before recovery.");
    const ids = new Set();
    value.projects.forEach(p => {
      validate(p);
      if (ids.has(p.id)) throw Error("Duplicate project ID.");
      ids.add(p.id);
    });
    return copy(value);
  }
  function load(storage) {
    const raw = storage.getItem(KEY);
    if (raw !== null) return validateWorkspace(JSON.parse(raw));
    const legacy = storage.getItem(LEGACY);
    const project = migrate(legacy === null ? M.newStore() : JSON.parse(legacy));
    if (legacy === null) project.name += " (demo)";
    const workspace = {version: 2, projects: [project]};
    storage.setItem(KEY, JSON.stringify(workspace));
    return workspace;
  }
  function commit(storage, workspace) {
    validateWorkspace(workspace);
    storage.setItem(KEY, JSON.stringify(workspace));
  }
  function importProject(data) {
    const project = data.version === 2 ? validate(data) : migrate(data);
    const id = uid();
    return validate({...project, id, name: project.name, status: "active",
      entities: project.entities.map(e => ({...e, projectId: id})),
      relations: project.relations.map(r => ({...r, projectId: id}))});
  }
  function membershipCandidates(library, project, selectedIds, includeRoute = false) {
    const byId = new Map(library.entities.map(e => [e.id,e]));
    const chosen = new Set(selectedIds);
    for (const id of chosen) if (!byId.has(id)) throw Error('Library object not found: '+id);
    if (includeRoute) {
      const links = library.relations.filter(r => !r.scopeProjectId || r.scopeProjectId===project.id);
      const steps = new Set();
      for (const id of chosen) {
        if (byId.get(id)?.type==='Production Step') steps.add(id);
        if (!['Part','Part Revision'].includes(byId.get(id)?.type)) continue;
        for (const link of links) if (['applies_to','consumes','produces'].includes(link.type) && link.to===id && byId.get(link.from)?.type==='Production Step') steps.add(link.from);
      }
      let changed=true;
      while (changed) {
        changed=false;
        for (const link of links) {
          if (!['precedes','on_failure','rework_of'].includes(link.type) || byId.get(link.from)?.type!=='Production Step' || byId.get(link.to)?.type!=='Production Step') continue;
          if (steps.has(link.from)!==steps.has(link.to)) {steps.add(link.from);steps.add(link.to);changed=true;}
        }
      }
      for (const id of steps) chosen.add(id);
      for (const link of links) {
        if (steps.has(link.from) && ['requires','applies_to','consumes','produces','controls','supported_by'].includes(link.type)) chosen.add(link.to);
        if (steps.has(link.to) && ['assignment_scope','potentially_affects'].includes(link.type)) chosen.add(link.from);
      }
      const assignments = new Set([...chosen].filter(id => byId.get(id)?.type==='Assignment'));
      for (const link of links) if (assignments.has(link.from) && link.type==='assigned_to') chosen.add(link.to);
    }
    for (const id of [...chosen]) {
      let parent=byId.get(id)?.parentWorkId;
      while (parent && !chosen.has(parent) && !project.entities.some(e=>e.id===parent)) {
        if (!byId.has(parent)) throw Error('Parent process step not found: '+parent);
        chosen.add(parent);parent=byId.get(parent)?.parentWorkId;
      }
    }
    return [...chosen].filter(id => !project.entities.some(e=>e.id===id));
  }
  function attachMembers(project, library, ids) {
    const byId=new Map(library.entities.map(e=>[e.id,e]));
    for (const id of membershipCandidates(library,project,ids,false)) {
      const entity=byId.get(id);
      if (!entity) throw Error('Library object not found: '+id);
      project.entities.push({...entity,projectId:project.id});
    }
    validate(project);
    return project;
  }
  const api = {KEY, LEGACY, create, validate, validateWorkspace, migrate, load, commit, importProject, membershipCandidates, attachMembers};
  if (typeof module === "object") module.exports = api;
  else root.ProjectStore = api;
})(globalThis);
