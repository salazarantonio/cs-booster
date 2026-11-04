import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const portable=path.join(root,'release','CS Booster');
const packaged=path.join(portable,'resources','app');
const vendor=path.join(root,'node_modules','electron','dist');
async function files(directory,prefix=''){
  const result=[];
  for(const item of await fs.readdir(directory,{withFileTypes:true})){
    assert.equal(item.isSymbolicLink(),false,`Redirecionamento no pacote: ${prefix+item.name}`);
    const name=path.join(prefix,item.name);
    if(item.isDirectory())result.push(...await files(path.join(directory,item.name),name));
    else if(item.isFile())result.push(name);
    else throw new Error(`Tipo de arquivo inesperado: ${name}`);
  }
  return result;
}
const hash=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const manifest=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
const electron=JSON.parse(await fs.readFile(path.join(root,'node_modules','electron','package.json'),'utf8'));
assert.equal(manifest.devDependencies.electron,electron.version,'O runtime instalado difere da versão fixada.');
let runtimeFiles=0,applicationFiles=0;
for(const name of await files(vendor)){
  const destination=name==='electron.exe'?'CS Booster.exe':name;
  assert.equal(await hash(path.join(vendor,name)),await hash(path.join(portable,destination)),`Runtime divergente: ${destination}`);
  runtimeFiles++;
}
for(const entry of ['main.mjs','preload.cjs','package.json','renderer','lib']){
  const current=path.join(root,entry);
  const names=(await fs.stat(current)).isDirectory()?(await files(current)).map(name=>path.join(entry,name)):[entry];
  for(const name of names){
    assert.equal(await hash(path.join(root,name)),await hash(path.join(packaged,name)),`Fonte desatualizada: ${name}`);
    applicationFiles++;
  }
}
const executable=await fs.readFile(path.join(portable,'CS Booster.exe'));
assert.equal(executable.toString('ascii',0,2),'MZ');
const pe=executable.readUInt32LE(0x3c);
assert.equal(executable.toString('ascii',pe,pe+4),'PE\0\0');
assert.equal(executable.readUInt16LE(pe+4),0x8664,'O pacote deve ser Windows x64.');
const report={passed:true,scope:'package-consistency-only',at:new Date().toISOString(),version:manifest.version,electron:electron.version,architecture:'x64',runtimeFiles,applicationFiles,executableSha256:await hash(path.join(portable,'CS Booster.exe')),desktopStartupVerified:false};
await fs.mkdir(path.join(root,'evidence'),{recursive:true});
await fs.writeFile(path.join(root,'evidence','package-validation.json'),JSON.stringify(report,null,2));
console.log(`Pacote ${manifest.version}: ${runtimeFiles} arquivos do runtime e ${applicationFiles} arquivos do aplicativo conferidos. Esta verificação não comprova abertura da janela.`);
