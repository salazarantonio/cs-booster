import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export async function buildPackage({root,fsApi=fs,runId=randomUUID()}={}){
  if(!path.isAbsolute(root)||!/^[A-Za-z0-9-]+$/.test(runId))throw new Error('Pasta de projeto ou identificador de compilação inválido.');
  const releaseRoot=path.resolve(root,'release');
  const inside=name=>{
    const resolved=path.resolve(releaseRoot,name);
    if(!resolved.startsWith(releaseRoot+path.sep))throw new Error('Destino fora da pasta release.');
    return resolved;
  };
  const destination=inside('CS Booster');
  const staging=inside(`CS Booster.build-${runId}`);
  const previous=inside(`CS Booster.previous-${runId}`);
  await fsApi.mkdir(releaseRoot,{recursive:true});
  await fsApi.mkdir(staging);
  let archived=false;
  try{
    await fsApi.cp(path.join(root,'node_modules/electron/dist'),staging,{recursive:true});
    // Rename before publishing: no existing executable is replaced in place.
    await fsApi.rename(path.join(staging,'electron.exe'),path.join(staging,'CS Booster.exe'));
    const appDir=path.join(staging,'resources/app');
    await fsApi.mkdir(appDir,{recursive:true});
    for(const entry of ['main.mjs','preload.cjs','package.json','renderer','lib'])await fsApi.cp(path.join(root,entry),path.join(appDir,entry),{recursive:true});
    let old;
    try{old=await fsApi.lstat(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(old){
      if(!old.isDirectory()||old.isSymbolicLink())throw new Error('O pacote anterior não é uma pasta regular.');
      const data=path.join(destination,'resources/app/data');
      let dataStat;
      try{dataStat=await fsApi.lstat(data);}catch(error){if(error.code!=='ENOENT')throw error;}
      if(dataStat){
        if(!dataStat.isDirectory()||dataStat.isSymbolicLink())throw new Error('Dados locais redirecionados: publicação recusada.');
        await fsApi.cp(data,path.join(appDir,'data'),{recursive:true});
      }
      await fsApi.rename(destination,previous);
      archived=true;
    }
    try{await fsApi.rename(staging,destination);}catch(error){
      if(archived){
        try{await fsApi.rename(previous,destination);archived=false;}
        catch(recovery){throw new Error(`Publicação falhou e a recuperação automática não foi concluída. Pacote anterior preservado em ${previous}. ${recovery.message}`,{cause:error});}
      }
      throw error;
    }
    return {destination,previous:archived?previous:null};
  }catch(error){throw new Error(`Pacote não publicado: ${error.message}. Área de compilação preservada: ${staging}`,{cause:error});}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const result=await buildPackage({root});
  console.log(result.destination);
  if(result.previous)console.log(`Pacote anterior e seus dados preservados: ${result.previous}`);
}
