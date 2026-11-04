import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const DEBLOAT_APPS = Object.freeze([
  {id:'solitaire',name:'Microsoft Solitaire Collection',packageName:'Microsoft.MicrosoftSolitaireCollection'},
  {id:'candy-crush',name:'Candy Crush Saga',packageName:'king.com.CandyCrushSaga'},
  {id:'candy-crush-soda',name:'Candy Crush Soda Saga',packageName:'king.com.CandyCrushSodaSaga'},
  {id:'bubble-witch',name:'Bubble Witch 3 Saga',packageName:'king.com.BubbleWitch3Saga'},
  {id:'xbox',name:'Aplicativo Xbox',packageName:'Microsoft.GamingApp',warning:'Pode ser necessário para Game Pass e instalação de jogos Xbox.'},
  {id:'xbox-console',name:'Xbox Console Companion',packageName:'Microsoft.XboxApp'},
  {id:'xbox-gamebar',name:'Xbox Game Bar',packageName:'Microsoft.XboxGamingOverlay',warning:'Remove a Game Bar e recursos relacionados. Fora do perfil sugerido para CS2.'},
  {id:'xbox-overlay',name:'Xbox Game Overlay',packageName:'Microsoft.XboxGameOverlay'},
  {id:'clipchamp',name:'Clipchamp',packageName:'Clipchamp.Clipchamp'},
  {id:'news',name:'Microsoft Notícias',packageName:'Microsoft.BingNews'},
  {id:'weather',name:'Microsoft Clima',packageName:'Microsoft.BingWeather'},
  {id:'get-help',name:'Obter Ajuda',packageName:'Microsoft.GetHelp'},
  {id:'tips',name:'Dicas do Windows',packageName:'Microsoft.Getstarted'},
  {id:'people',name:'Microsoft Pessoas',packageName:'Microsoft.People'},
  {id:'maps',name:'Mapas do Windows',packageName:'Microsoft.WindowsMaps'},
  {id:'feedback',name:'Hub de Comentários',packageName:'Microsoft.WindowsFeedbackHub'},
  {id:'mixed-reality',name:'Portal de Realidade Mista',packageName:'Microsoft.MixedReality.Portal'},
  {id:'movies',name:'Filmes e TV',packageName:'Microsoft.ZuneVideo'},
]);

const names = DEBLOAT_APPS.map(a => `'${a.packageName}'`).join(',');
export const DEBLOAT_QUERY = `$names=@(${names});$packages=@(Get-AppxPackage -ErrorAction Stop | Where-Object {$names -contains $_.Name} | Select-Object Name,PackageFullName,IsFramework,NonRemovable);@{packages=$packages}|ConvertTo-Json -Depth 4 -Compress`;

function checkedPackages(value) {
  if(!value || !Array.isArray(value.packages))throw new Error('O Windows não retornou um inventário válido de aplicativos.');
  return value.packages.map(p=>{
    const known=DEBLOAT_APPS.find(a=>a.packageName===p.Name);
    if(!known||typeof p.PackageFullName!=='string'||!p.PackageFullName.startsWith(known.packageName+'_')||! /^[A-Za-z0-9._~\-]{1,256}$/.test(p.PackageFullName))throw new Error('O inventário contém um pacote fora da lista autorizada.');
    return p;
  });
}

export function createDebloatService(dataDir,{powershell}) {
  let queue=Promise.resolve();
  const exclusive=fn=>{const task=queue.then(fn);queue=task.catch(()=>{});return task;};
  const query=async()=>checkedPackages(await powershell(DEBLOAT_QUERY));
  async function getDebloatApps(){
    const installed=await query();
    return {scope:'current-user',supported:true,apps:DEBLOAT_APPS.map(app=>{
      const packages=installed.filter(p=>p.Name===app.packageName);
      return {...app,installed:packages.length>0,removable:packages.length>0&&packages.every(p=>p.NonRemovable===false&&p.IsFramework===false)};
    }),message:'Selecione somente os aplicativos que deseja REMOVER da conta atual. Nada é selecionado automaticamente. A remoção não inclui backup dos dados dos aplicativos; reinstalação depende da disponibilidade na Store.'};
  }
  async function applyDebloat({ids,confirmed}={}){return exclusive(async()=>{
    if(confirmed!==true)throw new Error('Confirme a lista de aplicativos a remover.');
    if(!Array.isArray(ids)||ids.length===0||ids.length>DEBLOAT_APPS.length||ids.some(id=>typeof id!=='string'||!DEBLOAT_APPS.some(a=>a.id===id)))throw new Error('Seleção de aplicativos inválida.');
    const selected=[...new Set(ids)].map(id=>DEBLOAT_APPS.find(a=>a.id===id));
    const installed=await query();
    const candidates=selected.map(app=>({...app,packages:installed.filter(p=>p.Name===app.packageName)}));
    if(candidates.some(app=>app.packages.some(p=>p.NonRemovable!==false||p.IsFramework!==false)))throw new Error('A seleção contém um pacote protegido ou de infraestrutura. Nada foi removido.');
    const report={id:randomUUID(),at:new Date().toISOString(),scope:'current-user',kind:'debloat-report-not-backup',selected:ids,packages:installed.filter(p=>candidates.some(a=>a.packageName===p.Name)),results:[]};
    const dir=path.join(dataDir,'debloat-reports');await fs.mkdir(dir,{recursive:true});
    const file=path.join(dir,report.id+'.json');
    await fs.writeFile(file,JSON.stringify(report,null,2),{flag:'wx'});
    for(const candidate of candidates){
      if(!candidate.packages.length){report.results.push({id:candidate.id,name:candidate.name,status:'already-absent'});continue;}
      try{
        for(const p of candidate.packages){
          // Values are validated exact package names, never caller-supplied PowerShell.
          await powershell(`Remove-AppxPackage -Package '${p.PackageFullName}' -ErrorAction Stop;@{ok=$true}|ConvertTo-Json -Compress`);
        }
        const remaining=(await query()).some(p=>p.Name===candidate.packageName);
        if(remaining)throw new Error('O aplicativo ainda consta no inventário após a remoção.');
        report.results.push({id:candidate.id,name:candidate.name,status:'removed'});
      }catch(error){report.results.push({id:candidate.id,name:candidate.name,status:'failed',error:error.message});}
      await fs.writeFile(file,JSON.stringify(report,null,2));
    }
    await fs.writeFile(file,JSON.stringify(report,null,2));
    const failed=report.results.some(r=>r.status==='failed');
    return {ok:!failed,partial:failed&&report.results.some(r=>r.status==='removed'),reportId:report.id,results:report.results,message:failed?'Algumas remoções falharam. Confira o resultado de cada aplicativo.':'Seleção processada e inventário verificado. O relatório não é um backup dos aplicativos.'};
  });}
  return {getDebloatApps,applyDebloat};
}
