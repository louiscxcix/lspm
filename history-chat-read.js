// This worker only reads the three previously selected Kakao rooms.
try{process.stdout.write(JSON.stringify(require('./import-kakao-ontology').readMessages()));}catch{process.stderr.write('Local Kakao read unavailable.');process.exitCode=1;}
