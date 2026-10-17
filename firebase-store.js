(function (root) {
  root.FirebaseStore = {
    ready: (async () => {
      // Legacy Firebase adapter is not part of the Supabase app. Keep its API key out of source control.
      const apiKey = root.PM_FIREBASE_API_KEY;
      if (!apiKey) throw new Error('Legacy Firebase adapter is disabled during the Supabase migration.');
      const version = '11.10.0';
      const [{initializeApp}, Auth, Firestore, AI] = await Promise.all([
        import(`https://www.gstatic.com/firebasejs/${version}/firebase-app.js`),
        import(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`),
        import(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`),
        import(`https://www.gstatic.com/firebasejs/${version}/firebase-ai.js`)
      ]);
      const app = initializeApp({
        apiKey,, authDomain: 'ontho-166a6.firebaseapp.com',
        projectId: 'ontho-166a6', storageBucket: 'ontho-166a6.firebasestorage.app',
        messagingSenderId: '857703572607', appId: '1:857703572607:web:8c8f4b81fa9ebfe57d4b4a'
      });
      const auth = Auth.getAuth(app), db = Firestore.getFirestore(app);
      const metaRef = uid => Firestore.doc(db, 'users', uid, 'workspace', 'meta');
      const projectRef = (uid, id) => Firestore.doc(db, 'users', uid, 'projects', id);
      async function load(uid) {
        const [meta, projects] = await Promise.all([
          Firestore.getDoc(metaRef(uid)), Firestore.getDocs(Firestore.collection(db, 'users', uid, 'projects'))
        ]);
        return {projects: projects.docs.map(doc => doc.data()), revision: meta.exists() ? (meta.data().revision || 0) : 0};
      }
      async function save(uid, workspace, revision) {
        await Firestore.runTransaction(db, async transaction => {
          const meta = await transaction.get(metaRef(uid));
          const current = meta.exists() ? (meta.data().revision || 0) : 0;
          if (current !== revision) throw Error('Cloud data changed. Reload before saving.');
          workspace.projects.forEach(project => transaction.set(projectRef(uid, project.id), project));
          transaction.set(metaRef(uid), {revision: current + 1, updatedAt: new Date().toISOString()});
        });
        return revision + 1;
      }
      const safeName=name=>String(name||'source.txt').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(-120);
      const toBase64=async blob=>{
        const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
        for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
        return btoa(binary);
      };
      async function uploadSource(uid,projectId,input) {
        const blob=input instanceof Blob?input:new Blob([String(input.text||'')],{type:'text/plain'});
        if(!blob.size||blob.size>10_000_000)throw Error('Source must be between 1 byte and 10 MB.');
        const allowed=['text/plain','text/markdown','text/csv','application/pdf'];
        if(!allowed.includes(blob.type||'text/plain'))throw Error('Use TXT, Markdown, CSV, or PDF.');
        const sourceId='source-'+crypto.randomUUID(),filename=safeName(input.name||'pasted-notes.txt');
        const encoded=await toBase64(blob),chunks=encoded.match(/.{1,400000}/g)||[];
        const source={sourceId,projectId,filename,mimeType:blob.type||'text/plain',size:blob.size,uploadedAt:new Date().toISOString(),uploadedBy:uid,retention:'retain',status:'uploaded',storage:'firestore_chunks',chunkCount:chunks.length};
        const batch=Firestore.writeBatch(db),base=['users',uid,'projects',projectId,'sources',sourceId];
        batch.set(Firestore.doc(db,...base),source);
        chunks.forEach((data,index)=>batch.set(Firestore.doc(db,...base,'chunks',String(index).padStart(4,'0')),{index,data}));
        await batch.commit();
        return source;
      }
      async function saveIngestionJob(uid,projectId,job) {
        await Firestore.setDoc(Firestore.doc(db,'users',uid,'projects',projectId,'ingestionJobs',job.jobId),job,{merge:true});
      }
      const responseSchema=AI.Schema.object({properties:{
        summary:AI.Schema.string(),
        objects:AI.Schema.array({items:AI.Schema.object({properties:{candidateId:AI.Schema.string(),suggestedAction:AI.Schema.string(),matchedObjectId:AI.Schema.string(),type:AI.Schema.string(),name:AI.Schema.string(),status:AI.Schema.string(),occurredDate:AI.Schema.string(),confidence:AI.Schema.number(),sourceExcerpt:AI.Schema.string()},optionalProperties:['matchedObjectId','status','occurredDate']})}),
        relationships:AI.Schema.array({items:AI.Schema.object({properties:{candidateId:AI.Schema.string(),type:AI.Schema.string(),from:AI.Schema.string(),to:AI.Schema.string(),confidence:AI.Schema.number(),sourceExcerpt:AI.Schema.string()}})}),
        unresolved:AI.Schema.array({items:AI.Schema.object({properties:{text:AI.Schema.string(),reason:AI.Schema.string()}})})
      }});
      const model=AI.getGenerativeModel(AI.getAI(app,{backend:new AI.GoogleAIBackend()}),{model:'gemini-3.8-flash',generationConfig:{responseMimeType:'application/json',responseSchema,temperature:.1}});
      const inlinePart=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Could not read source file.'));reader.onload=()=>resolve({inlineData:{data:String(reader.result).split(',')[1],mimeType:file.type||'text/plain'}});reader.readAsDataURL(file);});
      async function extractOntology(project,source,content) {
        const prompt=window.Ingestion.buildPrompt(project,source);
        const parts=typeof content==='string'?[`${prompt}\nSOURCE CONTENT:\n${content}`]:[prompt,await inlinePart(content)];
        const result=await model.generateContent(parts);
        return JSON.parse(result.response.text());
      }
      return {
        onUser: callback => Auth.onAuthStateChanged(auth, callback),
        signIn: () => Auth.signInWithPopup(auth, new Auth.GoogleAuthProvider()),
        signOut: () => Auth.signOut(auth), load, save, uploadSource, saveIngestionJob, extractOntology
      };
    })()
  };
})(window);
