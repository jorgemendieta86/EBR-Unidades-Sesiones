(()=>{
'use strict';

const $=id=>document.getElementById(id);
const $$=sel=>[...document.querySelectorAll(sel)];
const STORE_KEY='materiales_ebr_primaria_v2_5_project';
const LEGACY_STORE_KEYS=['materiales_ebr_primaria_v2_4_project','materiales_ebr_primaria_v2_3_project','materiales_ebr_primaria_v2_2_project','materiales_ebr_primaria_v2_1_project'];
const MONTHS=['marzo','abril','mayo','junio','julio','agosto','setiembre','septiembre','octubre','noviembre','diciembre'];
const MONTH_LABELS={marzo:'Marzo',abril:'Abril',mayo:'Mayo',junio:'Junio',julio:'Julio',agosto:'Agosto',setiembre:'Setiembre',septiembre:'Setiembre',octubre:'Octubre',noviembre:'Noviembre',diciembre:'Diciembre'};
const MONTH_NUM={marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,setiembre:9,septiembre:9,octubre:10,noviembre:11,diciembre:12};
const AREA_ALIASES={
  personal_social:['personal social'],
  educacion_fisica:['educacion fisica','educ. fisica','educación física'],
  arte:['arte y cultura','arte y creatividad','arte y cult','arte'],
  comunicacion:['comunicacion','comunicación'],
  matematica:['matematica','matemática'],
  ciencia:['ciencia y tecnologia','ciencia y tecnología'],
  religion:['educacion religiosa','educación religiosa','religion','religión'],
  transversal:['competencias transversales','comp trans','temas transversales','contenidos transversales']
};

let state=blankState();
let currentPreview=null;
let droppedProgramFile=null;

function blankState(){
  return {
    source:{name:'',type:'',text:'',structured:null},
    program:{school:'',teacher:'',year:new Date().getFullYear(),periodType:'',grades:[],cycles:[],areas:[],sessionAreaId:'all',units:[],warnings:[],confirmed:false},
    students:{sourceName:'',names:[]},
    generatedUnits:{},generatedSessions:{},lastSaved:null
  };
}

function normalize(s=''){
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[“”"'´`]/g,'').replace(/[^a-z0-9ñ\s]/g,' ').replace(/\s+/g,' ').trim();
}
function clean(s=''){return String(s).replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim();}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function slug(s=''){return normalize(s).replace(/\s+/g,'_').replace(/[^a-z0-9_ñ]/g,'').slice(0,70)||'documento';}
function uniq(arr){return [...new Set(arr.filter(Boolean))];}
function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function getArea(id){return (window.CURRICULUM?.areas||[]).find(a=>a.id===id)||null;}
function getComp(areaId,compId){return getArea(areaId)?.competencies.find(c=>c.id===compId)||null;}
function cyclesFromGrades(grades){return uniq(grades.map(g=>g<=2?'III':g<=4?'IV':'V'));}
function gradeLabel(grades){return grades.length?grades.map(g=>`${g}.°`).join(', '):'No identificado';}
function cycleLabel(cycles){return cycles.length?cycles.map(c=>`Ciclo ${c}`).join(', '):'No identificado';}
function levelLabel(cycle){return ({III:'3',IV:'4',V:'5'}[cycle]||cycle);}
function pad2(n){return String(Number(n)||0).padStart(2,'0')}
function isoDate(y,m,d){return `${Number(y)||''}-${pad2(m)}-${pad2(d)}`}
function formatIsoDate(iso){if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||''))return '';const [y,m,d]=iso.split('-');return `${d}/${m}/${y}`}
function extractDateInfo(text='',fallbackYear=0,fallbackMonth=''){
  const raw=clean(text),monthRx='marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre';
  let m=raw.match(/(?:del\s*)?(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](20\d{2}))?\.?\s*(?:al|a|[-–—])\s*(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](20\d{2}))?/i);
  if(m){const y1=Number(m[3]||m[6]||fallbackYear),y2=Number(m[6]||m[3]||fallbackYear);if(y1&&y2){const start=isoDate(y1,m[2],m[1]),end=isoDate(y2,m[5],m[4]);return {startDate:start,endDate:end,dateText:`${formatIsoDate(start)} – ${formatIsoDate(end)}`}}}
  m=raw.match(new RegExp(`(?:del\s*)?(\d{1,2})\s*(?:al|a|[-–—])\s*(\d{1,2})\s+de\s+(${monthRx})(?:\s+de)?\s*(20\d{2})?`,'i'));
  if(m){const y=Number(m[4]||fallbackYear),mn=MONTH_NUM[normalize(m[3])];if(y&&mn){const start=isoDate(y,mn,m[1]),end=isoDate(y,mn,m[2]);return {startDate:start,endDate:end,dateText:`${formatIsoDate(start)} – ${formatIsoDate(end)}`}}}
  m=raw.match(new RegExp(`(?:del\s*)?(\d{1,2})\s+de\s+(${monthRx})\s*(?:al|a|[-–—])\s*(\d{1,2})\s+de\s+(${monthRx})(?:\s+de)?\s*(20\d{2})?`,'i'));
  if(m){const y=Number(m[5]||fallbackYear),m1=MONTH_NUM[normalize(m[2])],m2=MONTH_NUM[normalize(m[4])];if(y&&m1&&m2){const start=isoDate(y,m1,m[1]),end=isoDate(y,m2,m[3]);return {startDate:start,endDate:end,dateText:`${formatIsoDate(start)} – ${formatIsoDate(end)}`}}}
  const fallbackNum=MONTH_NUM[normalize(fallbackMonth)];
  return {startDate:'',endDate:'',dateText:'',monthNumber:fallbackNum||0};
}
function unitDateLabel(u){if(u.dateText)return u.dateText;if(u.startDate||u.endDate)return [formatIsoDate(u.startDate),formatIsoDate(u.endDate)].filter(Boolean).join(' – ');if(u.month&&u.days)return `${u.month} · ${u.days} días`;if(u.month)return u.month;if(u.days)return `${u.days} días`;return 'Fecha no identificada';}
function unitDateFileTag(u){if(u.startDate&&u.endDate)return `${formatIsoDate(u.startDate).replaceAll('/','-')}_a_${formatIsoDate(u.endDate).replaceAll('/','-')}`;if(u.dateText)return slug(u.dateText).slice(0,35);if(u.month)return slug(u.month);return 'sin_fecha'}
function unitDurationText(u){const exact=u.dateText||([formatIsoDate(u.startDate),formatIsoDate(u.endDate)].filter(Boolean).join(' – '));if(u.days&&exact)return `${u.days} días (${exact})`;if(u.days&&u.month)return `${u.days} días (${u.month})`;if(u.days)return `${u.days} días`;if(exact)return exact;return u.month||'No identificada'}
function enrichUnitDates(units,text,year){for(const u of units){if(u.dateText||u.startDate)continue;const title=(u.title||'').trim();if(!title)continue;const probes=[title,title.slice(0,Math.min(45,title.length))].filter(x=>x.length>12);let idx=-1;for(const probe of probes){idx=text.toLowerCase().indexOf(probe.toLowerCase());if(idx>=0)break}if(idx<0)continue;const around=text.slice(Math.max(0,idx-260),Math.min(text.length,idx+title.length+260));const info=extractDateInfo(around,year,u.month);if(info.dateText)Object.assign(u,info)}return units;}
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),3300);}
function saveProject(silent=false){state.lastSaved=new Date().toISOString();localStorage.setItem(STORE_KEY,JSON.stringify(state));if(!silent)toast('Proyecto guardado en este navegador.');}
function readSavedProject(){
  try{
    let raw=localStorage.getItem(STORE_KEY),sourceKey=STORE_KEY;
    if(!raw){for(const key of LEGACY_STORE_KEYS){raw=localStorage.getItem(key);if(raw){sourceKey=key;break}}}
    if(!raw)return null;
    const parsed=JSON.parse(raw),base=blankState();
    return {...base,...parsed,source:{...base.source,...parsed.source},program:{...base.program,...parsed.program},students:{...base.students,...(parsed.students||{})},_sourceKey:sourceKey};
  }catch(e){console.warn(e);return null}
}
function clearStoredProjects(){localStorage.removeItem(STORE_KEY);for(const key of LEGACY_STORE_KEYS)localStorage.removeItem(key);}
function applySavedProject(saved){
  if(!saved)return;
  const base=blankState();state={...base,...saved,source:{...base.source,...saved.source},program:{...base.program,...saved.program},students:{...base.students,...(saved.students||{})}};
  delete state._sourceKey;hydrateFromState();saveProject(true);
}
function startNewProject(fromTopButton=false){
  if(fromTopButton&&!confirm('¿Deseas iniciar un proyecto nuevo? Se eliminarán la programación, unidades, sesiones y lista de estudiantes guardadas.'))return;
  clearStoredProjects();state=blankState();droppedProgramFile=null;
  const pf=$('programFile');if(pf)pf.value='';
  const sf=$('studentsFile');if(sf)sf.value='';
  if($('programTextFallback'))$('programTextFallback').value='';
  if($('programFileState'))$('programFileState').textContent='Aún no has seleccionado un archivo.';
  if($('analysisPanel'))$('analysisPanel').classList.add('hidden');
  if($('unitsList'))$('unitsList').innerHTML='';
  if($('sessionsList'))$('sessionsList').innerHTML='';
  if($('unitsContextBanner'))$('unitsContextBanner').innerHTML='';
  if($('sessionsContextBanner'))$('sessionsContextBanner').innerHTML='';
  if($('analysisBadge')){$('analysisBadge').textContent='Por confirmar';$('analysisBadge').className='badge draft';}
  renderStudents();renderChecks();updateStepAccess();setStep(1);
  if(fromTopButton)toast('Proyecto nuevo listo. Carga una programación para comenzar.');
}
function resetProject(){startNewProject(true);}
function initStartup(){
  const saved=readSavedProject(),modal=$('startupModal'),btn=$('btnContinueLast'),summary=$('lastProjectSummary'),data=$('lastProjectData'),card=$('continueProjectCard');
  if(!modal)return;
  if(saved&&(saved.source?.name||saved.program?.units?.length)){
    const school=saved.program?.school||'IE no identificada',teacher=saved.program?.teacher||'Docente no identificado';
    summary.textContent=saved.source?.name?`Último documento: ${saved.source.name}`:'Se encontró un proyecto guardado.';
    data.innerHTML=`<span><b>IE:</b> ${esc(school)}</span><span><b>Docente:</b> ${esc(teacher)}</span><span><b>Año:</b> ${esc(saved.program?.year||'')}</span>`;
    btn.disabled=false;
    btn.onclick=()=>{applySavedProject(saved);modal.classList.add('hidden');toast('Se cargó la última programación guardada.');};
  }else{
    summary.textContent='No se encontró una programación anterior en este navegador.';
    data.innerHTML='';
    btn.disabled=true;card.classList.add('disabled');
  }
  $('btnStartNew').onclick=()=>{startNewProject(false);modal.classList.add('hidden');};
}

function renderChecks(){
  const p=state.program;
  const checks=[
    [!!state.source.name||!!state.source.text,'Programación integrada cargada','Sube la programación anual completa en Word, PDF o pega su texto.'],
    [p.units.length>0,'Experiencias identificadas',p.units.length?`${p.units.length} experiencias/unidades encontradas en la programación.`:'Aún no se han identificado experiencias.'],
    [p.areas.length>0,'Áreas curriculares reconocidas',p.areas.length?`${p.areas.length} áreas curriculares encontradas.`:'Aún no se han reconocido las áreas de la programación.'],
    [p.confirmed,'Programación confirmada',p.confirmed?'Ya puedes generar todas las unidades integradas.':'Revisa la información detectada y confirma la programación.']
  ];
  $('projectChecks').innerHTML=checks.map(([ok,title,desc])=>`<div class="check-row ${ok?'ok':''}"><div class="check-icon">${ok?'✓':'·'}</div><div><strong>${esc(title)}</strong><small>${esc(desc)}</small></div></div>`).join('');
}

function setStep(step){
  const max=state.program.confirmed?(Object.keys(state.generatedUnits).length?3:2):1;
  if(step>max)return;
  $$('.step-panel').forEach(x=>x.classList.remove('active'));$('step-'+step).classList.add('active');
  $$('.step-tab').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===step));
  $$('[data-step-indicator]').forEach(n=>{const s=Number(n.dataset.stepIndicator);n.classList.toggle('active',s===step);n.classList.toggle('done',s<step || (s===1&&state.program.confirmed) || (s===2&&Object.keys(state.generatedUnits).length));});
  window.scrollTo({top:0,behavior:'smooth'});
}
function updateStepAccess(){
  const unitTab=$$('.step-tab')[1],sessionTab=$$('.step-tab')[2];
  unitTab.disabled=!state.program.confirmed;
  sessionTab.disabled=!Object.keys(state.generatedUnits).length;
}

// ---------- ZIP/DOCX READER ----------
function u16(v,o){return v[o]|(v[o+1]<<8)}
function u32(v,o){return (v[o]|(v[o+1]<<8)|(v[o+2]<<16)|(v[o+3]<<24))>>>0}
async function unzipDocx(buffer){
  const bytes=new Uint8Array(buffer);let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(u32(bytes,i)===0x06054b50){eocd=i;break}}
  if(eocd<0)throw new Error('No se encontró la estructura ZIP del archivo Word.');
  const count=u16(bytes,eocd+10),cdOffset=u32(bytes,eocd+16);let pos=cdOffset;const entries={};
  for(let n=0;n<count;n++){
    if(u32(bytes,pos)!==0x02014b50)break;
    const method=u16(bytes,pos+10),compSize=u32(bytes,pos+20),nameLen=u16(bytes,pos+28),extraLen=u16(bytes,pos+30),commentLen=u16(bytes,pos+32),localOffset=u32(bytes,pos+42);
    const name=new TextDecoder().decode(bytes.slice(pos+46,pos+46+nameLen));
    if(name==='word/document.xml'){
      const ln=u16(bytes,localOffset+26),le=u16(bytes,localOffset+28),start=localOffset+30+ln+le,raw=bytes.slice(start,start+compSize);
      let out;
      if(method===0)out=raw;
      else if(method===8){
        if(!('DecompressionStream' in window))throw new Error('Este navegador no puede descomprimir el archivo Word.');
        const ds=new DecompressionStream('deflate-raw');out=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
      }else throw new Error('Método de compresión Word no compatible.');
      entries[name]=new TextDecoder('utf-8').decode(out);break;
    }
    pos+=46+nameLen+extraLen+commentLen;
  }
  if(!entries['word/document.xml'])throw new Error('No se encontró el contenido principal del documento Word.');
  return parseWordXml(entries['word/document.xml']);
}
function parseWordXml(xml){
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const body=doc.getElementsByTagNameNS(ns,'body')[0];
  const paragraphs=[],tables=[],blocks=[];
  const pText=p=>{let out='';for(const node of p.getElementsByTagNameNS(ns,'*')){if(node.localName==='t')out+=node.textContent;else if(node.localName==='tab')out+='\t';else if(node.localName==='br')out+='\n'}return clean(out)};
  if(body){for(const child of body.children){
    if(child.localName==='p'){const t=pText(child);if(t){paragraphs.push(t);blocks.push({type:'p',text:t})}}
    if(child.localName==='tbl'){
      const rows=[];for(const tr of child.getElementsByTagNameNS(ns,'tr')){const cells=[];for(const tc of tr.getElementsByTagNameNS(ns,'tc')){const ps=[...tc.getElementsByTagNameNS(ns,'p')].map(pText).filter(Boolean);const value=clean(ps.join('\n'));const spanEl=tc.getElementsByTagNameNS(ns,'gridSpan')[0];const span=spanEl?Number(spanEl.getAttributeNS(ns,'val')||spanEl.getAttribute('w:val')||spanEl.getAttribute('val')||1):1;for(let k=0;k<Math.max(1,span);k++)cells.push(value)}rows.push(cells)}
      tables.push(rows);blocks.push({type:'table',rows});
    }
  }}
  const text=blocks.map(b=>b.type==='p'?b.text:b.rows.map(r=>r.join(' | ')).join('\n')).join('\n');
  return {paragraphs,tables,blocks,text:clean(text)};
}
async function extractPdf(file){
  if(!window.pdfjsLib)throw new Error('El lector PDF no se cargó. Usa Word (.docx) o pega el texto.');
  try{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';}catch(e){}
  const data=new Uint8Array(await file.arrayBuffer());const pdf=await pdfjsLib.getDocument({data}).promise;let pages=[];
  for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const tc=await page.getTextContent();pages.push(tc.items.map(x=>x.str).join(' '));}
  return {paragraphs:pages,tables:[],blocks:pages.map(text=>({type:'p',text})),text:clean(pages.join('\n'))};
}
async function readProgramFile(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(ext==='docx')return unzipDocx(await file.arrayBuffer());
  if(ext==='pdf')return extractPdf(file);
  if(ext==='txt'){const text=await file.text();return {paragraphs:text.split(/\n+/).map(clean).filter(Boolean),tables:[],blocks:[],text:clean(text)}};
  throw new Error('Formato no compatible. Usa .docx, .pdf o .txt.');
}

async function unzipSelectedEntries(buffer,predicate){
  const bytes=new Uint8Array(buffer);let eocd=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(u32(bytes,i)===0x06054b50){eocd=i;break}}
  if(eocd<0)throw new Error('No se encontró la estructura ZIP del archivo.');
  const count=u16(bytes,eocd+10),cdOffset=u32(bytes,eocd+16);let pos=cdOffset;const entries={};
  for(let n=0;n<count;n++){
    if(u32(bytes,pos)!==0x02014b50)break;
    const method=u16(bytes,pos+10),compSize=u32(bytes,pos+20),nameLen=u16(bytes,pos+28),extraLen=u16(bytes,pos+30),commentLen=u16(bytes,pos+32),localOffset=u32(bytes,pos+42);
    const name=new TextDecoder().decode(bytes.slice(pos+46,pos+46+nameLen));
    if(predicate(name)){
      const ln=u16(bytes,localOffset+26),le=u16(bytes,localOffset+28),start=localOffset+30+ln+le,raw=bytes.slice(start,start+compSize);let out;
      if(method===0)out=raw;
      else if(method===8){
        if(!('DecompressionStream' in window))throw new Error('Este navegador no puede descomprimir el archivo.');
        const ds=new DecompressionStream('deflate-raw');out=new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
      }else{pos+=46+nameLen+extraLen+commentLen;continue}
      entries[name]=new TextDecoder('utf-8').decode(out);
    }
    pos+=46+nameLen+extraLen+commentLen;
  }
  return entries;
}
function excelColumnIndex(ref='A1'){
  const letters=(String(ref).match(/[A-Z]+/i)||['A'])[0].toUpperCase();let n=0;for(const c of letters)n=n*26+(c.charCodeAt(0)-64);return n-1;
}
async function readXlsxRows(file){
  const entries=await unzipSelectedEntries(await file.arrayBuffer(),name=>name==='xl/sharedStrings.xml'||/^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
  const parser=new DOMParser(),shared=[];
  if(entries['xl/sharedStrings.xml']){
    const doc=parser.parseFromString(entries['xl/sharedStrings.xml'],'application/xml');
    for(const si of [...doc.getElementsByTagNameNS('*','si')])shared.push([...si.getElementsByTagNameNS('*','t')].map(x=>x.textContent).join(''));
  }
  const sheets=Object.keys(entries).filter(x=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(x)).sort((a,b)=>Number((a.match(/\d+/)||[0])[0])-Number((b.match(/\d+/)||[0])[0]));
  const all=[];
  for(const name of sheets){
    const doc=parser.parseFromString(entries[name],'application/xml');
    for(const row of [...doc.getElementsByTagNameNS('*','row')]){
      const values=[];for(const c of [...row.getElementsByTagNameNS('*','c')]){
        const idx=excelColumnIndex(c.getAttribute('r')||'A1'),type=c.getAttribute('t')||'',v=c.getElementsByTagNameNS('*','v')[0],inline=[...c.getElementsByTagNameNS('*','t')].map(x=>x.textContent).join('');
        let value=inline||v?.textContent||'';if(type==='s'&&v)value=shared[Number(v.textContent)]??value;values[idx]=clean(value);
      }
      if(values.some(Boolean))all.push(values.map(x=>x||''));
    }
    if(all.length)break;
  }
  return all;
}
function likelyStudentName(v=''){
  const t=clean(v);if(t.length<5||t.length>100)return false;
  const n=normalize(t);if(!/[a-záéíóúñ]/i.test(t)||/\b(dni|grado|seccion|sección|apellidos|nombres|estudiante|alumno|institucion|institución|codigo|código|orden|nivel)\b/i.test(n))return false;
  if(/^\d+$/.test(n))return false;
  const words=t.split(/\s+/).filter(Boolean);return words.length>=2&&words.filter(w=>/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(w)).length>=2;
}
function cleanStudentName(v=''){
  return clean(v).replace(/^\s*\d{1,3}\s*[.)-]?\s*/,'').replace(/\s{2,}/g,' ').trim();
}
function extractStudentsFromRows(rows){
  if(!rows?.length)return [];
  const firstRows=rows.slice(0,25);let headerRow=-1,nameCol=-1,lastCol=-1,firstCol=-1;
  for(let r=0;r<firstRows.length;r++){
    const norms=firstRows[r].map(normalize);
    for(let c=0;c<norms.length;c++){
      if(/apellidos?\s+y\s+nombres?|nombres?\s+y\s+apellidos?|estudiante|alumno/.test(norms[c])){headerRow=r;nameCol=c;break}
      if(/^apellidos?$/.test(norms[c]))lastCol=c;
      if(/^nombres?$/.test(norms[c]))firstCol=c;
    }
    if(nameCol>=0||lastCol>=0&&firstCol>=0){headerRow=r;break}
  }
  let values=[];
  if(nameCol>=0)values=rows.slice(headerRow+1).map(r=>r[nameCol]);
  else if(lastCol>=0&&firstCol>=0)values=rows.slice(headerRow+1).map(r=>`${r[lastCol]||''} ${r[firstCol]||''}`);
  else{
    const maxCols=Math.max(...rows.map(r=>r.length),1);let bestCol=0,bestScore=-1;
    for(let c=0;c<maxCols;c++){const score=rows.map(r=>r[c]).filter(likelyStudentName).length;if(score>bestScore){bestScore=score;bestCol=c}}
    values=rows.map(r=>r[bestCol]);
  }
  return uniq(values.map(cleanStudentName).filter(likelyStudentName));
}
function extractStudentsFromText(text=''){
  const lines=String(text).split(/\r?\n/).map(cleanStudentName).filter(Boolean);
  let names=lines.filter(likelyStudentName);
  if(names.length<2){
    names=String(text).split(/[;|]+/).map(cleanStudentName).filter(likelyStudentName);
  }
  return uniq(names);
}
async function readStudentsFile(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(ext==='xlsx')return extractStudentsFromRows(await readXlsxRows(file));
  if(ext==='csv'){
    const text=await file.text(),rows=text.split(/\r?\n/).filter(Boolean).map(line=>line.split(/[,;	]/).map(clean));
    return extractStudentsFromRows(rows);
  }
  if(ext==='docx'){
    const struct=await unzipDocx(await file.arrayBuffer()),rows=(struct.tables||[]).flat();
    const fromRows=extractStudentsFromRows(rows);return fromRows.length?fromRows:extractStudentsFromText(struct.text);
  }
  if(ext==='txt')return extractStudentsFromText(await file.text());
  throw new Error('Formato no compatible. Usa Excel (.xlsx), CSV, Word (.docx) o TXT.');
}
function renderStudents(){
  if(!$('studentsBadge'))return;
  const names=state.students?.names||[],count=names.length;
  $('studentsBadge').textContent=count?`${count} estudiantes`:'Sin lista';
  $('studentsBadge').className=count?'badge ok':'badge draft';
  $('studentsEditor').value=names.join('\n');
}
async function autoImportStudents(file){
  if(!file)return;
  const input=$('studentsFile');
  if(input)input.disabled=true;
  try{
    const names=await readStudentsFile(file);
    if(!names.length){
      state.students={sourceName:'',names:[]};renderStudents();
      toast('No se identificaron nombres de estudiantes. Revisa el archivo seleccionado.');return;
    }
    state.students={sourceName:file.name,names};
    renderStudents();
    if(Object.keys(state.generatedUnits).length)renderSessionsList();
    saveProject(true);
    const review=$('studentsReview');if(review)review.open=true;
    toast(`${names.length} estudiantes cargados. Revisa o corrige los nombres si es necesario.`);
  }catch(err){
    console.error(err);state.students={sourceName:'',names:[]};renderStudents();
    toast(`No se pudo leer la lista: ${err.message}`);
  }finally{
    if(input)input.disabled=false;
  }
}
function saveStudentsEditor(){
  const names=uniq($('studentsEditor').value.split(/\r?\n/).map(cleanStudentName).filter(likelyStudentName));
  state.students.names=names;renderStudents();if(Object.keys(state.generatedUnits).length)renderSessionsList();saveProject(true);toast(`${names.length} estudiantes guardados.`);
}
function clearStudents(){
  state.students={sourceName:'',names:[]};const f=$('studentsFile');if(f)f.value='';renderStudents();if(Object.keys(state.generatedUnits).length)renderSessionsList();saveProject(true);const review=$('studentsReview');if(review)review.open=false;toast('Lista de estudiantes eliminada.');
}

// ---------- PROGRAM ANALYSIS ----------
function findAreaFromText(txt){
  const n=normalize(txt),compact=n.replace(/\s+/g,'');for(const [id,aliases] of Object.entries(AREA_ALIASES)){if(aliases.some(a=>{const an=normalize(a);return n.includes(an)||compact.includes(an.replace(/\s+/g,''))}))return id}return '';
}
function detectAreas(struct){
  const found=new Set();const text=struct.text||'';
  for(const area of (CURRICULUM.areas||[])){
    if(area.id==='transversal')continue;
    const aliases=AREA_ALIASES[area.id]||[area.name], nt=normalize(text), ct=nt.replace(/\s+/g,'');if(aliases.some(a=>{const an=normalize(a);return nt.includes(an)||ct.includes(an.replace(/\s+/g,''))}))found.add(area.id);
    for(const c of area.competencies){if(normalize(text).includes(normalize(c.name).slice(0,Math.min(44,normalize(c.name).length))))found.add(area.id)}
  }
  return [...found];
}
function extractMetadata(text){
  const flat=clean(text),lines=flat.split(/\n+/).map(clean).filter(Boolean);
  let school='',teacher='';
  for(const line of lines){
    if(!school && /instituci[oó]n educativa/i.test(line)){school=line.replace(/^.*?instituci[oó]n educativa\s*[:\-]?\s*/i,'').replace(/^[|:\-\s]+/,'').trim();if(school.length>120)school=school.slice(0,120)}
    if(!teacher && /(docente responsable|docente de aula)/i.test(line)){teacher=line.replace(/^.*?(docente responsable|docente de aula)\s*[:\-]?\s*/i,'').replace(/^[|:\-\s]+/,'').trim();if(teacher.length>100)teacher=''}
  }
  if(!school){const m=flat.match(/I\.?\s*E\.?\s*(?:N[°º.]?\s*)?\d{3,6}[^\n|]{0,70}/i);if(m)school=clean(m[0])}
  if(!teacher){const m=flat.match(/Prof\.?\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ. ]{5,70}/);if(m)teacher=clean(m[0])}
  const years=[...flat.matchAll(/\b20\d{2}\b/g)].map(m=>Number(m[0])).filter(y=>y>=2024&&y<=2100);const counts={};years.forEach(y=>counts[y]=(counts[y]||0)+1);const year=Number(Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||new Date().getFullYear());
  return {school,teacher,year};
}
function detectGrades(text){
  const n=normalize(text);const grades=new Set();
  for(let g=1;g<=6;g++){const rx=new RegExp(`(?:grado|grados)[^\\n]{0,40}\\b${g}\\b|\\b${g}\\s*(?:°|º|ro|do|to)?\\s*grado`,'i');if(rx.test(text))grades.add(g)}
  const cycles=[];
  if(/\biii\b/.test(n)&&/(nivel|ciclo)/.test(n))cycles.push('III');
  if(/\biv\b/.test(n)&&/(nivel|ciclo)/.test(n))cycles.push('IV');
  if(/\bv\b/.test(n)&&/(nivel|ciclo)/.test(n))cycles.push('V');
  if(!grades.size&&cycles.length){if(cycles.includes('III')){grades.add(1);grades.add(2)}if(cycles.includes('IV')){grades.add(3);grades.add(4)}if(cycles.includes('V')){grades.add(5);grades.add(6)}}
  return {grades:[...grades].sort((a,b)=>a-b),cycles:cycles.length?cycles:cyclesFromGrades([...grades])};
}
function tableHeaderMap(row){const map={};row.forEach((c,i)=>{const n=normalize(c);if(n.includes('duracion'))map.duration??=i;if(n.includes('calendario comunal'))map.calendar??=i;if(n.includes('problemas'))map.problems??=i;if(n.includes('potencial'))map.potential??=i;if(n.includes('necesidades'))map.needs??=i;if(n.includes('situacion significativa'))map.situation??=i;if(n.includes('titulo')&&n.includes('experiencia'))map.title??=i});return map;}
function parseAnnualMatrixTables(tables,year){
  const units=[];
  for(const t of tables){if(!t.length)continue;const map=tableHeaderMap(t[0]);if(map.duration==null||map.situation==null||map.title==null)continue;
    for(let r=1;r<t.length;r++){
      const row=t[r];const dur=clean(row[map.duration]||'');const title=clean(row[map.title]||'');if(!dur&&!title)continue;
      const m=dur.match(/(Marzo|Abril|Mayo|Junio|Julio|Agosto|Setiembre|Septiembre|Octubre|Noviembre|Diciembre)/i);if(!m)continue;
      const month=m?MONTH_LABELS[normalize(m[1])]||m[1]:'';const days=Number((dur.match(/(\d+)\s*d[ií]as/i)||[])[1]||0);const dateInfo=extractDateInfo(dur,year,month);
      units.push({month,days,...dateInfo,title:stripQuotes(title),situation:clean(row[map.situation]||''),calendar:clean(row[map.calendar]||''),problems:clean(row[map.problems]||''),potential:clean(row[map.potential]||''),needs:clean(row[map.needs]||'')});
    }
  }
  return units;
}
function stripQuotes(s=''){return clean(s).replace(/^[“"']+|[”"'.]+$/g,'').trim();}
function findCompetency(areaId,text){
  const area=getArea(areaId);if(!area)return null;const n=normalize(text),nc=n.replace(/\s+/g,'');
  if(areaId==='transversal'){if(n.includes('entornos virtuales'))return area.competencies.find(c=>c.id==='tic_entornos')||area.competencies[0];if(n.includes('aprendizaje de manera autonoma'))return area.competencies.find(c=>c.id==='auto_aprendizaje')||area.competencies[1];}
  let best=null,bestLen=0;for(const c of area.competencies){const cn=normalize(c.name),cc=cn.replace(/\s+/g,'');const key=cn.slice(0,Math.min(55,cn.length)),keyc=key.replace(/\s+/g,'');if(n.includes(key)||cn.includes(n)||nc.includes(keyc)||cc.includes(nc)){if(keyc.length>bestLen){best=c;bestLen=keyc.length}}}return best;
}
function parseDistributionTable(tables){
  for(const t of tables){if(t.length<6)continue;const joined=normalize(t.slice(0,5).flat().join(' '));if(!joined.includes('organizacion y distribucion del tiempo')||!joined.includes('eda 01'))continue;
    const headerUnits=(t[2]||[]).slice(3).map((x,i)=>clean(x)||`EdA ${String(i+1).padStart(2,'0')}`);
    const titles=(t[3]||[]).slice(3);const days=(t[4]||[]).slice(3).map(x=>Number((x.match(/\d+/)||[])[0]||0));
    const periods=(t[1]||[]).slice(3);
    const mapping=headerUnits.map((_,i)=>({title:stripQuotes(titles[i]||''),days:days[i]||0,period:clean(periods[i]||''),competenciesByArea:{},approaches:[]}));
    let currentArea='';
    for(let r=5;r<t.length;r++){
      const row=t[r];if(row.length<4)continue;const cell2=clean(row[2]||'');const rowArea=findAreaFromText(row[0]||'');if(rowArea)currentArea=rowArea;const areaId=rowArea||currentArea;
      if(areaId){
        const comp=findCompetency(areaId,cell2);if(comp){for(let i=0;i<mapping.length;i++){if(/^x$/i.test(clean(row[3+i]||''))){mapping[i].competenciesByArea[areaId]??=[];mapping[i].competenciesByArea[areaId].push(comp.id)}}continue;}
      }
      const n0=normalize(row[0]||'');if(n0.includes('enfoque ')){
        const label=clean(row[0]);for(let i=0;i<mapping.length;i++){if(/^x$/i.test(clean(row[3+i]||'')))mapping[i].approaches.push(label)}
      }
    }
    // second approach matrix begins with row containing UNIDADES DENOMINACIÓN
    const approachStart=t.findIndex(r=>normalize(r.join(' ')).includes('unidades denominacion'));
    if(approachStart>=0){for(let r=approachStart+1;r<t.length;r++){const row=t[r],label=clean(row[0]||'');if(!normalize(label).includes('enfoque'))continue;for(let i=0;i<mapping.length;i++){if(/^x$/i.test(clean(row[3+i]||'')))mapping[i].approaches.push(label)}}}
    mapping.forEach(m=>{m.approaches=uniq(m.approaches)});return mapping;
  }
  return [];
}
function parseGenericUnits(text){
  const lines=text.split(/\n+/).map(clean).filter(Boolean);const out=[];
  for(let i=0;i<lines.length;i++){
    let m=lines[i].match(/(?:EdA|Unidad|Experiencia(?: de aprendizaje)?)\s*(?:N[°º.]?\s*)?(\d{1,2})\s*[:\-–]?\s*(.*)/i);if(!m)continue;
    let title=stripQuotes(m[2]||'');if(!title&&lines[i+1])title=stripQuotes(lines[i+1]);
    out.push({month:'',days:0,title:title||`Unidad ${m[1]}`,situation:'',calendar:'',problems:'',potential:'',needs:''});
  }
  if(out.length)return dedupeUnits(out);
  // month fallback
  const ntext='\n'+text;for(const month of MONTHS){const rx=new RegExp(`\\n(${month})\\b([\\s\\S]{0,2500}?)(?=\\n(?:${MONTHS.join('|')})\\b|$)`,'i');const m=ntext.match(rx);if(!m)continue;const block=m[2];const days=Number((block.match(/(\d+)\s*d[ií]as/i)||[])[1]||0);const quotes=[...block.matchAll(/[“"]([^”"]{15,180})[”"]/g)].map(x=>x[1]);const title=quotes.at(-1)||`${MONTH_LABELS[month]} - Unidad`;const paras=block.split(/\n+/).map(clean).filter(x=>x.length>120);const situation=paras.find(x=>/estudiantes|reto|situaci[oó]n/i.test(x))||paras.sort((a,b)=>b.length-a.length)[0]||'';out.push({month:MONTH_LABELS[month],days,title,situation,calendar:'',problems:'',potential:'',needs:''});}
  return dedupeUnits(out);
}
function dedupeUnits(units){const seen=new Set();return units.filter(u=>{const k=normalize(u.title||u.month);if(!k||seen.has(k))return false;seen.add(k);return true})}
function mergeUnitSources(detailed,dist){
  const n=Math.max(detailed.length,dist.length);const out=[];
  for(let i=0;i<n;i++){const a=detailed[i]||{},b=dist[i]||{};out.push({id:`u${i+1}`,number:i+1,month:a.month||'',days:a.days||b.days||0,dateText:a.dateText||b.dateText||'',startDate:a.startDate||b.startDate||'',endDate:a.endDate||b.endDate||'',period:b.period||'',title:a.title||b.title||`Unidad ${String(i+1).padStart(2,'0')}`,situation:a.situation||'',calendar:a.calendar||'',problems:a.problems||'',potential:a.potential||'',needs:a.needs||'',competenciesByArea:b.competenciesByArea||{},approaches:b.approaches||[],sessionCount:0})}
  return out;
}
function analyzeStructured(struct){
  const meta=extractMetadata(struct.text),gradeInfo=detectGrades(struct.text),areas=detectAreas(struct),detailed=parseAnnualMatrixTables(struct.tables||[],meta.year),dist=parseDistributionTable(struct.tables||[]);let units=mergeUnitSources(detailed,dist);
  if(!units.length)units=parseGenericUnits(struct.text).map((u,i)=>({...u,id:`u${i+1}`,number:i+1,dateText:'',startDate:'',endDate:'',period:'',competenciesByArea:{},approaches:[],sessionCount:0}));
  enrichUnitDates(units,struct.text||'',meta.year);
  let periodType='';const n=normalize(struct.text);if(n.includes('trimestre'))periodType='Trimestres';else if(n.includes('bimestre'))periodType='Bimestres';
  return {school:meta.school,teacher:meta.teacher,year:meta.year,periodType,grades:gradeInfo.grades,cycles:gradeInfo.cycles,areas,sessionAreaId:'all',units,warnings:[],confirmed:false};
}
function unitAreaIds(unit,includeTransversal=false){
  const ids=Object.entries(unit.competenciesByArea||{}).filter(([,v])=>Array.isArray(v)&&v.length).map(([id])=>id);
  return ids.filter(id=>includeTransversal||id!=='transversal');
}
function unitAreaSummary(unit){return unitAreaIds(unit).map(id=>getArea(id)?.name||id)}
function unitHasCurriculum(unit){return unitAreaIds(unit).length>0}
function weeksForUnit(unit){return Math.max(1,(unit.days||20)/5)}
function totalSessionTarget(unit){return clamp(Math.round(weeksForUnit(unit)*11),8,60)}
function areaSessionAllocation(unit){
  const areaIds=unitAreaIds(unit);if(!areaIds.length)return {};
  const target=totalSessionTarget(unit);const weights=Object.fromEntries(areaIds.map(id=>[id,Math.max(1,getArea(id)?.defaultHours||2)]));const total=Object.values(weights).reduce((a,b)=>a+b,0);
  const alloc={};let assigned=0;areaIds.forEach(id=>{alloc[id]=Math.max(1,Math.floor(target*weights[id]/total));assigned+=alloc[id]});
  const ranked=areaIds.slice().sort((a,b)=>(target*weights[b]/total-Math.floor(target*weights[b]/total))-(target*weights[a]/total-Math.floor(target*weights[a]/total)));
  let i=0;while(assigned<target){alloc[ranked[i%ranked.length]]++;assigned++;i++}while(assigned>target){const id=ranked.slice().reverse().find(x=>alloc[x]>1);if(!id)break;alloc[id]--;assigned--}
  return alloc;
}

function renderAnalysis(){
  const p=state.program;$('analysisPanel').classList.remove('hidden');$('analysisBadge').textContent=p.confirmed?'Confirmada':'Por confirmar';$('analysisBadge').className=p.confirmed?'badge ok':'badge draft';$('detectedSchool').value=p.school||'';$('detectedTeacher').value=p.teacher||'';$('detectedYear').value=p.year||new Date().getFullYear();$('detectedPeriodType').value=p.periodType||'';
  $('detectedGrades').innerHTML=[1,2,3,4,5,6].map(g=>`<label class="chip-check"><input type="checkbox" data-grade="${g}" ${p.grades.includes(g)?'checked':''}><span>${g}.°</span></label>`).join('');
  const areaNames=p.areas.map(id=>getArea(id)?.name).filter(Boolean);$('detectedAreas').innerHTML=areaNames.length?areaNames.map(n=>`<span class="chip area">${esc(n)}</span>`).join(''):'<span class="chip">No identificada</span>';
  $('detectedUnitCount').textContent=p.units.length;renderDetectedUnits();renderWarnings();renderChecks();
}
function renderDetectedUnits(){
  const p=state.program;
  $('detectedUnitsEditor').innerHTML=p.units.map((u,i)=>{
    const areas=unitAreaSummary(u);const compCount=Object.values(u.competenciesByArea||{}).reduce((n,a)=>n+(Array.isArray(a)?a.length:0),0);
    const detail=areas.length?`${areas.length} áreas · ${compCount} competencias planificadas`:'No se pudo recuperar la distribución de competencias de esta experiencia.';
    return `<div class="detected-unit" data-unit-id="${u.id}">
      <div class="unit-num">U${String(i+1).padStart(2,'0')}</div>
      <label>Mes<input data-field="month" value="${esc(u.month||'')}"></label>
      <label>Días<input data-field="days" type="number" min="0" max="60" value="${u.days||''}"></label>
      <label class="date-field">Fecha / periodo<input data-field="dateText" value="${esc(u.dateText||'')}" placeholder="Ej. 03/08/2026 – 28/08/2026"><small>${u.dateText?'Recuperada de la programación.':'Si la programación no consigna fechas exactas, se mostrará el mes y los días.'}</small></label>
      <label>Título<input data-field="title" value="${esc(u.title||'')}"></label>
      <label class="situation-field">Situación significativa<textarea data-field="situation" rows="3">${esc(u.situation||'')}</textarea><small>${esc(detail)}</small></label>
      <div class="delete-field"><button class="icon-btn" data-delete-unit="${u.id}" title="Eliminar unidad" type="button">×</button></div>
    </div>`
  }).join('')||'<div class="info-box">No se identificaron unidades. Usa “Agregar unidad” para registrarlas manualmente.</div>';
}
function syncAnalysisInputs(){
  const p=state.program;p.school=$('detectedSchool').value.trim();p.teacher=$('detectedTeacher').value.trim();p.year=Number($('detectedYear').value)||p.year;p.periodType=$('detectedPeriodType').value;p.grades=$$('#detectedGrades input[data-grade]:checked').map(x=>Number(x.dataset.grade));p.cycles=cyclesFromGrades(p.grades);
  $$('.detected-unit').forEach(el=>{const u=p.units.find(x=>x.id===el.dataset.unitId);if(!u)return;u.month=el.querySelector('[data-field="month"]').value.trim();u.days=Number(el.querySelector('[data-field="days"]').value)||0;u.dateText=el.querySelector('[data-field="dateText"]').value.trim();const info=extractDateInfo(u.dateText,p.year,u.month);u.startDate=info.startDate||'';u.endDate=info.endDate||'';if(info.dateText)u.dateText=info.dateText;u.title=el.querySelector('[data-field="title"]').value.trim();u.situation=el.querySelector('[data-field="situation"]').value.trim();});
}
function validateProgram(){
  syncAnalysisInputs();const p=state.program,w=[];
  if(!p.units.length)w.push('No se identificaron experiencias o unidades en la programación.');
  p.units.forEach((u,i)=>{if(!u.title)w.push(`La experiencia ${i+1} no tiene título.`);if(!u.situation)w.push(`La experiencia ${i+1} no tiene situación significativa identificada.`);if(!unitHasCurriculum(u))w.push(`No se recuperó la distribución de áreas y competencias de la experiencia ${i+1}; revisa el documento antes de generarla.`)});
  if(!p.grades.length)w.push('No se identificó el grado o grados. Selecciónalos antes de confirmar.');
  if(!p.areas.length)w.push('No se identificaron áreas curriculares en la programación.');
  if((p.areas||[]).includes('religion')){const area=getArea('religion');if(area?.competencies.some(c=>Object.values(c.standards||{}).some(s=>/Pendiente/i.test(s))))w.push('La base curricular de Educación Religiosa mantiene estándares pendientes de fuente oficial validada; revisa cuidadosamente los criterios generados.');}
  p.warnings=w;return w;
}
function renderWarnings(){
  const w=validateProgram(),p=state.program;const withCurriculum=p.units.filter(unitHasCurriculum).length;
  const summary=`<div class="info-box"><strong>${p.units.length} experiencias detectadas.</strong> ${withCurriculum} contienen distribución curricular recuperada y ${p.areas.length} áreas curriculares fueron reconocidas en la programación.</div>`;
  $('programWarnings').innerHTML=summary+(w.length?`<div class="warning-box"><strong>Revisa antes de continuar:</strong><ul>${w.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:`<div class="info-box"><strong>La programación integrada está lista.</strong> Puedes confirmarla y generar sus unidades integradas.</div>`);
}
function confirmProgram(){
  const w=validateProgram();const blocking=w.filter(x=>/No se identificaron experiencias|no tiene título|grado o grados|No se identificaron áreas curriculares/i.test(x));if(blocking.length){renderWarnings();toast('Completa los datos indispensables antes de confirmar.');return}
  state.program.confirmed=true;$('analysisBadge').textContent='Confirmada';$('analysisBadge').className='badge ok';renderChecks();updateStepAccess();renderUnitsList();populateSessionAreaFilter();saveProject(true);toast('Programación integrada confirmada. Ya puedes generar todas las unidades planificadas.');setStep(2);
}

// ---------- GENERATION LOGIC ----------
function themeFromUnit(u){return stripQuotes(u.title||'la situación de aprendizaje').replace(/[.!?]+$/,'');}
function standardCriterion(comp,cycle,u){
  const s=clean(comp?.standards?.[cycle]||'');if(!s||/Pendiente/i.test(s))return 'Criterio por precisar con fuente curricular oficial validada.';
  const first=(s.match(/^.*?[.!?](?:\s|$)/)||[])[0]||s.slice(0,260);return `${first.trim()} Se contextualiza en actividades relacionadas con «${themeFromUnit(u)}».`;
}
function evidenceFor(areaId,comp,u){
  const theme=themeFromUnit(u);const map={
    comunicacion:comp?.id?.includes('lee')?`Ficha de comprensión y organizador de información sobre ${theme}.`:comp?.id?.includes('escribe')?`Texto producido, revisado y mejorado en relación con ${theme}.`:`Participación oral organizada y registro de ideas sobre ${theme}.`,
    matematica:`Resolución argumentada de situaciones problemáticas contextualizadas en ${theme}.`,
    personal_social:`Organizador, explicación o propuesta de acción vinculada con ${theme}.`,
    ciencia:comp?.id?.includes('disena')?`Diseño o prototipo de solución tecnológica relacionado con ${theme}.`:comp?.id?.includes('indaga')?`Registro de indagación con datos, análisis y conclusiones sobre ${theme}.`:`Explicación sustentada mediante organizador, modelo o exposición sobre ${theme}.`,
    arte:`Producción artística y breve explicación del proceso creativo vinculada con ${theme}.`,
    educacion_fisica:`Demostración práctica y registro de desempeño en actividades relacionadas con ${theme}.`,
    religion:`Reflexión, organizador o compromiso personal relacionado con ${theme}.`
  };return map[areaId]||`Evidencia de aprendizaje vinculada con ${theme}.`;
}
function productFor(areaId,u){const theme=themeFromUnit(u);const map={comunicacion:`Producción comunicativa vinculada con ${theme}.`,matematica:`Portafolio de situaciones problemáticas contextualizadas en ${theme}.`,personal_social:`Producto de análisis y propuesta de acción sobre ${theme}.`,ciencia:`Producto de indagación, explicación o solución tecnológica sobre ${theme}.`,arte:`Producción artístico-cultural relacionada con ${theme}.`,educacion_fisica:`Demostración práctica de aprendizajes motrices vinculada con ${theme}.`,religion:`Producto de reflexión y compromiso relacionado con ${theme}.`};return map[areaId]||`Producto relacionado con ${theme}.`}
function actionForApproach(a){const n=normalize(a);if(n.includes('ambiental'))return 'Propone y practica acciones de cuidado del ambiente en las actividades de la unidad.';if(n.includes('derechos'))return 'Participa respetando sus derechos, responsabilidades y los de los demás.';if(n.includes('igualdad'))return 'Participa con equidad, sin asignar roles por estereotipos de género.';if(n.includes('intercultural'))return 'Valora los saberes, costumbres y expresiones culturales presentes en el contexto.';if(n.includes('diversidad')||n.includes('inclus'))return 'Respeta diferencias, ritmos y formas de participación de sus compañeros.';if(n.includes('excelencia'))return 'Muestra disposición para mejorar sus producciones y aprender de la retroalimentación.';return 'Colabora y contribuye al bienestar común durante las actividades.';}
function purposeFor(comp,u){const caps=(comp?.capacities||[]).slice(0,2).join(' y ').toLowerCase();return `Que los estudiantes desarrollen la competencia «${comp?.name||'competencia del área'}» al abordar situaciones vinculadas con «${themeFromUnit(u)}», movilizando ${caps||'las capacidades correspondientes'} y comunicando sus aprendizajes mediante una evidencia pertinente.`;}
function sessionFocuses(areaId,comp){
  const map={
    comunicacion:comp?.id?.includes('lee')?['Anticipamos y formulamos hipótesis','Localizamos información relevante','Inferimos y explicamos el sentido','Reflexionamos sobre el contenido']:comp?.id?.includes('escribe')?['Planificamos nuestro texto','Organizamos y desarrollamos ideas','Textualizamos la primera versión','Revisamos y mejoramos el texto']:['Organizamos ideas para comunicarnos','Escuchamos y recuperamos información','Intercambiamos ideas con respeto','Evaluamos nuestra participación oral'],
    matematica:['COMPRENSIÓN DEL PROBLEMA','BÚSQUEDA DE ESTRATEGIAS','REPRESENTACIÓN','FORMALIZACIÓN','REFLEXIÓN','TRANSFERENCIA'],
    personal_social:['Problematizamos una situación del contexto','Analizamos información y fuentes','Explicamos causas, relaciones o consecuencias','Tomamos acuerdos y proponemos acciones'],
    ciencia:comp?.id?.includes('indaga')?['Formulamos preguntas de indagación','Proponemos una posible explicación','Planificamos cómo obtener información','Registramos y analizamos datos','Elaboramos y comunicamos conclusiones']:comp?.id?.includes('disena')?['Identificamos una necesidad o problema','Proponemos alternativas de solución','Diseñamos y construimos la alternativa','Probamos y realizamos ajustes','Evaluamos y comunicamos la solución']:['Problematizamos el fenómeno','Recuperamos saberes y evidencias','Construimos una explicación','Aplicamos el conocimiento','Evaluamos implicancias y comunicamos'],
    arte:['Observamos y apreciamos referentes','Exploramos materiales y posibilidades','Investigamos técnicas y recursos','Desarrollamos nuestra creación','Reflexionamos y compartimos el proceso'],
    religion:['Auscultamos nuestra realidad','Iluminamos la situación desde el mensaje cristiano','Discernimos lo aprendido','Actuamos mediante un compromiso'],
    educacion_fisica:['Activamos el cuerpo y reconocemos el reto','Exploramos habilidades motrices','Practicamos de manera progresiva','Aplicamos estrategias con seguridad','Recuperamos y reflexionamos sobre el desempeño']
  };return map[areaId]||['Exploramos el reto','Desarrollamos el aprendizaje','Aplicamos lo aprendido','Reflexionamos sobre el proceso'];
}
function integratedProductFor(unit){
  const n=normalize(`${unit.title||''} ${unit.situation||''}`),theme=themeFromUnit(unit);
  if(/aliment|nutri|agropecu|producto local/.test(n))return 'Producto integrador sobre alimentación saludable y valoración de los productos de la comunidad.';
  if(/ambient|residuo|recicl|contamina|reforest/.test(n))return 'Campaña y producciones integradas para promover el cuidado del ambiente.';
  if(/identidad|patria|historia|nacion|peru/.test(n))return 'Muestra integrada de producciones para fortalecer la identidad y valorar nuestro patrimonio.';
  if(/conviv|derecho|deber|equidad|responsab/.test(n))return 'Propuestas, acuerdos y producciones para fortalecer la convivencia y la participación responsable.';
  if(/logro|culmin|cierre/.test(n))return 'Muestra organizada de evidencias y producciones de aprendizaje desarrolladas durante la experiencia.';
  return `Producto integrador relacionado con «${theme}», construido con aportes de las áreas curriculares planificadas.`;
}
function buildAreaBlocks(unit,cycles){
  const ids=unitAreaIds(unit,true);const order=['comunicacion','matematica','personal_social','ciencia','arte','religion','educacion_fisica','transversal'];
  return ids.sort((a,b)=>order.indexOf(a)-order.indexOf(b)).map(areaId=>{
    const area=getArea(areaId),compIds=unit.competenciesByArea?.[areaId]||[],comps=compIds.map(id=>getComp(areaId,id)).filter(Boolean);
    const purposes=comps.map(comp=>({comp,purpose:purposeFor(comp,unit),criteria:Object.fromEntries(cycles.map(c=>[c,standardCriterion(comp,c,unit)])),evidence:evidenceFor(areaId,comp,unit)}));
    return {area,purposes,evidence:purposes.map(x=>x.evidence).filter(Boolean).join(' / ')};
  }).filter(x=>x.area&&x.purposes.length);
}
function sessionTitleFor(areaId,comp,unit,focus,index=0){
  const theme=themeFromUnit(unit),name=comp?.name||'el aprendizaje del área';
  if(areaId==='matematica')return `${name.charAt(0).toUpperCase()+name.slice(1)} en situaciones relacionadas con ${theme}`;
  if(areaId==='comunicacion'&&comp?.id?.includes('lee'))return `Leemos y comprendemos textos relacionados con ${theme}`;
  if(areaId==='comunicacion'&&comp?.id?.includes('escribe'))return `Escribimos textos relacionados con ${theme}`;
  if(areaId==='comunicacion')return `Dialogamos y comunicamos ideas sobre ${theme}`;
  if(areaId==='personal_social')return `Analizamos y reflexionamos sobre ${theme}`;
  if(areaId==='ciencia')return `Investigamos y explicamos situaciones relacionadas con ${theme}`;
  if(areaId==='arte')return `Exploramos y creamos a partir de ${theme}`;
  if(areaId==='religion')return `Reflexionamos desde la fe sobre ${theme}`;
  if(areaId==='educacion_fisica')return `Fortalecemos nuestras habilidades motrices en actividades vinculadas con ${theme}`;
  return `${name}: ${theme}`;
}
function buildAreaSessionQueue(unit,areaId,count){
  const compIds=unit.competenciesByArea?.[areaId]||[];if(!compIds.length||areaId==='transversal')return [];
  const out=[];for(let i=0;i<count;i++){const compId=compIds[i%compIds.length],comp=getComp(areaId,compId),focuses=sessionFocuses(areaId,comp),focus=focuses[Math.floor(i/compIds.length)%focuses.length];out.push({areaId,compId,focus,title:sessionTitleFor(areaId,comp,unit,focus,i)})}return out;
}
function buildIntegratedSessionPlan(unit){
  const alloc=areaSessionAllocation(unit),order=['matematica','personal_social','comunicacion','ciencia','religion','arte','educacion_fisica'];
  const queues={};for(const id of order){if(alloc[id])queues[id]=buildAreaSessionQueue(unit,id,alloc[id])}
  for(const id of Object.keys(alloc)){if(!queues[id]&&id!=='transversal')queues[id]=buildAreaSessionQueue(unit,id,alloc[id])}
  const sessions=[],weekCount=clamp(Math.ceil((unit.days||20)/5),1,5),perWeek=Math.max(1,Math.ceil(totalSessionTarget(unit)/weekCount));let n=1,guard=0;while(Object.values(queues).some(q=>q.length)&&guard<200){guard++;for(const id of order.concat(Object.keys(queues).filter(x=>!order.includes(x)))){const q=queues[id];if(!q?.length)continue;const item=q.shift();sessions.push({...item,id:`${unit.id}_s${n}`,number:n,week:Math.min(weekCount,Math.ceil(n/perWeek))});n++;}}
  return sessions;
}
function buildUnitData(unit){
  const p=state.program,cycles=p.cycles.length?p.cycles:cyclesFromGrades(p.grades),areaBlocks=buildAreaBlocks(unit,cycles),sessions=buildIntegratedSessionPlan(unit);
  return {type:'unit',id:unit.id,number:unit.number,school:p.school,teacher:p.teacher,year:p.year,grades:p.grades,cycles,month:unit.month,period:unit.period,days:unit.days,dateText:unit.dateText||'',startDate:unit.startDate||'',endDate:unit.endDate||'',title:unit.title,situation:unit.situation||'La programación cargada no contiene una situación significativa claramente identificada para esta unidad.',product:integratedProductFor(unit),approaches:unit.approaches||[],areaBlocks,sessions,evaluation:'La evaluación será formativa, permanente y basada en los criterios y evidencias definidos en cada área curricular de la unidad.',resources:'Papelógrafos, material del entorno, textos y cuadernos de trabajo, fichas, útiles, recursos digitales, materiales artísticos y deportivos según las actividades planificadas.',bibliography:'Currículo Nacional, Programa Curricular de Educación Primaria, programación anual cargada y fuentes institucionales pertinentes.'};
}
function findUnitPurpose(unitData,areaId,compId){const block=unitData.areaBlocks.find(x=>x.area.id===areaId);return block?.purposes.find(x=>x.comp.id===compId)||null}
function sessionEvaluationCriteria(areaId,comp,session){
  const n=normalize(comp?.name||''),title=themeFromUnit({title:session.title});
  if(areaId==='matematica')return [
    `Identifica los datos, relaciones y condiciones del problema planteado en ${title}.`,
    'Aplica estrategias y procedimientos matemáticos pertinentes para resolver la situación.',
    'Explica, verifica y comunica con seguridad el procedimiento y el resultado obtenido.'
  ];
  if(areaId==='comunicacion'&&n.includes('lee'))return [
    'Identifica información relevante y explícita del texto trabajado.',
    'Infiere e interpreta información relacionando ideas del texto.',
    'Reflexiona y explica su comprensión con argumentos vinculados al texto.'
  ];
  if(areaId==='comunicacion'&&n.includes('escribe'))return [
    'Adecúa y organiza sus ideas de acuerdo con el propósito y destinatario.',
    'Desarrolla el texto con coherencia y utiliza recursos del lenguaje pertinentes.',
    'Revisa y mejora su producción a partir de los criterios y la retroalimentación.'
  ];
  if(areaId==='comunicacion')return [
    'Organiza y comunica sus ideas de manera comprensible.',
    'Escucha e interactúa respetando los aportes de sus interlocutores.',
    'Reflexiona sobre su participación y mejora la claridad de su comunicación.'
  ];
  if(areaId==='personal_social')return [
    'Identifica información relevante de la situación o fuente analizada.',
    'Explica relaciones, causas o consecuencias utilizando la información trabajada.',
    'Propone acuerdos, decisiones o acciones coherentes con el bienestar común.'
  ];
  if(areaId==='ciencia'&&n.includes('indaga'))return [
    'Formula o reconoce una pregunta de indagación y propone una respuesta posible.',
    'Obtiene, registra y analiza información o datos de manera organizada.',
    'Sustenta y comunica conclusiones a partir de la evidencia obtenida.'
  ];
  if(areaId==='ciencia')return [
    'Identifica y utiliza conocimientos científicos pertinentes al fenómeno estudiado.',
    'Explica relaciones o procesos utilizando evidencias y representaciones.',
    'Comunica una conclusión o propuesta fundamentada y reconoce sus implicancias.'
  ];
  if(areaId==='arte')return [
    'Explora y utiliza materiales, técnicas o elementos del lenguaje artístico.',
    'Desarrolla una creación coherente con la intención propuesta.',
    'Explica su proceso creativo y reconoce aspectos que puede mejorar.'
  ];
  if(areaId==='religion')return [
    'Relaciona la situación trabajada con el mensaje o enseñanza de fe.',
    'Reflexiona sobre el significado del aprendizaje en su vida cotidiana.',
    'Formula y asume un compromiso coherente con los valores trabajados.'
  ];
  if(areaId==='educacion_fisica')return [
    'Ejecuta las acciones motrices previstas con control y seguridad.',
    'Aplica reglas, estrategias y prácticas de autocuidado durante la actividad.',
    'Evalúa su desempeño y participa respetando las posibilidades de los demás.'
  ];
  return ['Comprende el propósito de la actividad.','Desarrolla la tarea aplicando estrategias pertinentes.','Explica o comunica el aprendizaje logrado.'];
}
function sessionPurposeFor(areaId,session){
  const t=String(session.title||'').replace(/[.]+$/,'');
  if(areaId==='matematica')return `El estudiante aprenderá a ${t.charAt(0).toLowerCase()+t.slice(1)}.`;
  if(areaId==='comunicacion')return `El estudiante comprenderá y comunicará aprendizajes mediante actividades vinculadas con «${t}».`;
  if(areaId==='ciencia')return `El estudiante construirá explicaciones o evidencias a partir de actividades vinculadas con «${t}».`;
  return `El estudiante desarrollará el aprendizaje propuesto en «${t}» mediante actividades propias del área.`;
}
function buildSessionData(unitData,session){
  const areaId=session.areaId,area=getArea(areaId),comp=getComp(areaId,session.compId),cycles=unitData.cycles,ref=findUnitPurpose(unitData,areaId,session.compId),criteria=ref?.criteria||Object.fromEntries(cycles.map(c=>[c,standardCriterion(comp,c,{title:session.title})]));const evidence=ref?.evidence||evidenceFor(areaId,comp,{title:session.title});const duration=areaId==='matematica'?135:90;const seq=sequenceFor(areaId,comp,session,unitData,duration);
  return {type:'session',id:session.id,number:session.number,unitNumber:unitData.number,school:unitData.school,teacher:unitData.teacher,year:unitData.year,area,areaId,grades:unitData.grades,cycles,title:session.title,sessionDate:session.dateText||'',comp,purpose:sessionPurposeFor(areaId,session),criteria,evidence,instrument:'Lista de cotejo',evaluationCriteria:sessionEvaluationCriteria(areaId,comp,session),students:[...(state.students?.names||[])],approaches:unitData.approaches.slice(0,1),sequence:seq,duration};
}

function sequenceFor(areaId,comp,session,unit,duration){
  const start=areaId==='matematica'?25:Math.round(duration*.18),end=areaId==='matematica'?10:Math.round(duration*.12),dev=duration-start-end;const theme=themeFromUnit(unit);let process=sessionFocuses(areaId,comp);
  if(areaId==='matematica'){
    const intro=`-Se presenta una situación problemática breve relacionada con «${theme}», previamente organizada para recuperar conocimientos necesarios.<br>-Los estudiantes observan, leen e identifican los datos conocidos, la condición del problema y aquello que deben averiguar.<br>-Se recuperan saberes previos mediante preguntas: ¿qué información conocemos?, ¿qué nos pide el problema?, ¿qué operaciones o relaciones podrían ayudarnos?, ¿hemos resuelto una situación parecida?<br>-Se plantea una pregunta retadora que genere conflicto cognitivo y motive la búsqueda de una estrategia.<br><b>PROPÓSITO:</b> ${sessionPurposeFor(areaId,session)}<br>-En grupo clase se acuerda una norma breve para orientar el trabajo.`;
    const development=`<b>COMPRENSIÓN DEL PROBLEMA:</b> Se presenta un nuevo problema relacionado con el aprendizaje de la sesión. Los estudiantes lo leen, identifican los datos, reconocen las condiciones y explican con sus propias palabras qué deben resolver.<br><b>BÚSQUEDA DE ESTRATEGIAS:</b> Proponen procedimientos personales o compartidos, recuperan estrategias conocidas, explican por qué podrían funcionar y comparan alternativas antes de elegir la más pertinente.<br><b>REPRESENTACIÓN:</b> Representan la información mediante material concreto, esquemas, gráficos, tablas o expresiones matemáticas según el grado; relacionan la representación con los datos del problema.<br><b>FORMALIZACIÓN:</b> Con apoyo del docente organizan el procedimiento seguido, expresan la noción o relación matemática construida y registran una conclusión que les permita utilizarla en otras situaciones.<br><b>REFLEXIÓN:</b> Contrastan sus estrategias y resultados, identifican aciertos y errores, comprueban la respuesta y explican por qué el procedimiento utilizado es válido.<br><b>TRANSFERENCIA:</b> Aplican lo aprendido en problemas similares. En el III nivel trabajan con mayor apoyo y material concreto; en el IV nivel resuelven situaciones en parejas y explican el procedimiento; en el V nivel desarrollan situaciones de mayor complejidad con mayor autonomía. Finalmente socializan sus respuestas y reciben retroalimentación.`;
    const close=`-Se dialoga sobre el procedimiento seguido y los aprendizajes logrados.<br>-Se formulan preguntas de metacognición: ¿qué aprendimos?, ¿qué estrategia utilizamos?, ¿qué dificultad encontramos?, ¿cómo comprobamos el resultado?, ¿en qué otra situación podemos aplicar lo aprendido?<br>-El docente brinda retroalimentación breve a partir de los criterios de evaluación.`;
    return [{moment:'INICIO',activities:intro,resources:'Papelote o pizarra, tarjetas, plumones y útiles.',time:start},{moment:'DESARROLLO',activities:development,resources:'Material concreto, papelotes, fichas, cuaderno de trabajo y útiles.',time:dev},{moment:'CIERRE',activities:close,resources:'Ficha de metacognición o cuaderno.',time:end}];
  }
  const intro=`Se presenta una situación breve vinculada con «${theme}». Los estudiantes observan, comentan e identifican información relevante. Se recuperan saberes previos mediante preguntas y se plantea una pregunta retadora que genere conflicto cognitivo.<br><b>PROPÓSITO:</b> ${sessionPurposeFor(areaId,session)}<br>Se acuerda una norma o compromiso breve para orientar el trabajo de la sesión.`;
  const development=process.map((p,i)=>`<b>${p}:</b> ${developmentSentence(areaId,p,theme,i)}`).join('<br>');
  const close=`Los estudiantes comparten lo aprendido, contrastan sus avances con el propósito y responden preguntas de metacognición: ¿qué aprendimos?, ¿qué estrategia nos ayudó?, ¿qué necesitamos seguir mejorando? El docente brinda retroalimentación breve.`;
  return [{moment:'INICIO',activities:intro,resources:'Situación contextual, papelote o pizarra, tarjetas y útiles.',time:start},{moment:'DESARROLLO',activities:development,resources:resourcesFor(areaId),time:dev},{moment:'CIERRE',activities:close,resources:'Ficha de metacognición o cuaderno.',time:end}];
}

function developmentSentence(areaId,phase,theme,i){
  if(areaId==='matematica')return ['Los estudiantes leen el problema, identifican los datos conocidos, las condiciones y lo que deben averiguar; explican con sus propias palabras qué se solicita.','Proponen y comparan estrategias personales o compartidas para resolver el problema, recuperando procedimientos conocidos y seleccionando los más pertinentes.','Representan la información con material concreto, esquemas, expresiones numéricas o simbólicas y explican la relación entre los datos.','Con apoyo del docente, organizan el procedimiento seguido y explicitan la relación, propiedad o noción matemática construida.','Contrastan sus estrategias y resultados, identifican aciertos o errores, verifican la respuesta y explican por qué el procedimiento es válido.','Aplican lo aprendido en una situación similar o de mayor reto, diferenciando la demanda según ciclo o grado y comunicando el procedimiento utilizado.'][i%6]||`Desarrollan una tarea vinculada con ${theme}.`;
  if(areaId==='comunicacion')return `Desarrollan la fase «${phase}» utilizando un texto, producción o intercambio comunicativo relacionado con ${theme}; registran información y reciben retroalimentación para mejorar.`;
  if(areaId==='personal_social')return `Analizan situaciones, experiencias o fuentes relacionadas con ${theme}, dialogan y construyen explicaciones o acuerdos de manera colaborativa.`;
  if(areaId==='ciencia')return `Desarrollan la fase «${phase}» a partir de una pregunta, evidencia o necesidad vinculada con ${theme}; registran sus decisiones y comunican resultados parciales.`;
  if(areaId==='arte')return `Exploran la fase «${phase}» empleando materiales, referentes y técnicas pertinentes; registran decisiones y ajustan su creación a partir de la observación y la retroalimentación.`;
  if(areaId==='religion')return `Relacionan la fase «${phase}» con experiencias de la vida cotidiana y el mensaje de fe, dialogando con respeto y formulando compromisos posibles.`;
  if(areaId==='educacion_fisica')return `Realizan la fase «${phase}» mediante experiencias motrices progresivas, respetando reglas, seguridad, autocuidado y posibilidades individuales.`;
  return `Desarrollan actividades vinculadas con ${theme}.`;
}
function resourcesFor(areaId){return {matematica:'Material concreto, papelotes, fichas, cuaderno y útiles.',comunicacion:'Textos, fichas, organizadores, cuaderno y útiles.',personal_social:'Fuentes, imágenes, mapas u organizadores y cuaderno.',ciencia:'Materiales de exploración, fichas de registro y fuentes confiables.',arte:'Materiales artísticos pertinentes, referentes visuales y útiles.',religion:'Biblia o texto de referencia, fichas, papelotes y útiles.',educacion_fisica:'Espacio seguro, implementos deportivos y útiles de aseo.'}[areaId]||'Materiales pertinentes al aprendizaje.';}

function generateAllUnits(){
  if(!state.program.confirmed)return;const units=state.program.units;if(!units.length){toast('No hay experiencias para generar.');return}
  state.generatedUnits={};for(const u of units)state.generatedUnits[u.id]=buildUnitData(u);state.generatedSessions={};populateSessionAreaFilter();renderUnitsList();renderSessionsList();updateStepAccess();$('btnDownloadUnitsZip').disabled=false;saveProject(true);toast(`${units.length} unidades integradas generadas a partir de la programación.`);
}
function generateOneUnit(id){const u=state.program.units.find(x=>x.id===id);if(!u)return;state.generatedUnits[id]=buildUnitData(u);delete state.generatedSessions[id];populateSessionAreaFilter();renderUnitsList();renderSessionsList();updateStepAccess();$('btnDownloadUnitsZip').disabled=Object.keys(state.generatedUnits).length!==state.program.units.length;saveProject(true);toast(`Unidad ${u.number} integrada generada.`);}
function activeSessionAreaId(){return state.program.sessionAreaId||'all'}
function filteredSessionsForUnit(ud,areaId=activeSessionAreaId()){return (ud.sessions||[]).filter(s=>areaId==='all'||s.areaId===areaId)}
function populateSessionAreaFilter(){
  const sel=$('sessionAreaFilter');if(!sel)return;const ids=uniq(Object.values(state.generatedUnits).flatMap(u=>(u.areaBlocks||[]).map(b=>b.area.id)).filter(id=>id!=='transversal'));
  const fallback=(state.program.areas||[]).filter(id=>id!=='transversal');const options=ids.length?ids:fallback;
  if(state.program.sessionAreaId!=='all'&&!options.includes(state.program.sessionAreaId))state.program.sessionAreaId='all';
  sel.innerHTML='<option value="all">Todas las áreas</option>'+options.map(id=>`<option value="${id}" ${id===state.program.sessionAreaId?'selected':''}>${esc(getArea(id)?.name||id)}</option>`).join('');sel.value=state.program.sessionAreaId||'all';updateSessionActionLabels();
}
function updateSessionActionLabels(){const id=activeSessionAreaId(),name=id==='all'?'todas las sesiones':`sesiones de ${getArea(id)?.name||'el área'}`;$('btnGenerateAllSessions').textContent=`Generar ${name}`;$('btnDownloadSessionsZip').textContent=id==='all'?'Descargar sesiones .ZIP':`Descargar ${getArea(id)?.name||'área'} .ZIP`;}
function mergeGeneratedSessions(uid,newSessions,areaId){
  if(areaId==='all'){state.generatedSessions[uid]=newSessions;return}
  const keep=(state.generatedSessions[uid]||[]).filter(s=>s.areaId!==areaId);state.generatedSessions[uid]=keep.concat(newSessions).sort((a,b)=>a.number-b.number);
}
function generateSessionsForUnit(uid,areaId=activeSessionAreaId()){
  const ud=state.generatedUnits[uid];if(!ud)return;const planned=filteredSessionsForUnit(ud,areaId);if(!planned.length){toast('Esta unidad no tiene sesiones planificadas para el área seleccionada.');return}
  const generated=planned.map(s=>buildSessionData(ud,s));mergeGeneratedSessions(uid,generated,areaId);renderSessionsList();$('btnDownloadSessionsZip').disabled=!Object.values(state.generatedSessions).some(a=>a.length);saveProject(true);toast(areaId==='all'?'Sesiones de la unidad generadas.':`Sesiones de ${getArea(areaId)?.name||'el área'} generadas para esta unidad.`);
}
function generateAllSessions(){
  if(!Object.keys(state.generatedUnits).length){toast('Primero genera las unidades.');return}const areaId=activeSessionAreaId();let count=0;
  if(areaId==='all')state.generatedSessions={};
  for(const [uid,ud] of Object.entries(state.generatedUnits)){const planned=filteredSessionsForUnit(ud,areaId);if(!planned.length)continue;const generated=planned.map(s=>buildSessionData(ud,s));mergeGeneratedSessions(uid,generated,areaId);count+=generated.length}
  renderSessionsList();$('btnDownloadSessionsZip').disabled=count===0&&!Object.values(state.generatedSessions).some(a=>a.length);saveProject(true);toast(areaId==='all'?`${count} sesiones generadas y organizadas por unidad y área.`:`${count} sesiones de ${getArea(areaId)?.name||'el área'} generadas.`);
}
function generateOneSession(uid,sid){const ud=state.generatedUnits[uid];if(!ud)return;const s=ud.sessions.find(x=>x.id===sid);if(!s)return;state.generatedSessions[uid]??=[];const idx=state.generatedSessions[uid].findIndex(x=>x.id===sid),data=buildSessionData(ud,s);if(idx>=0)state.generatedSessions[uid][idx]=data;else state.generatedSessions[uid].push(data);state.generatedSessions[uid].sort((a,b)=>a.number-b.number);renderSessionsList();$('btnDownloadSessionsZip').disabled=!Object.values(state.generatedSessions).some(a=>a.length);saveProject(true);}

// ---------- UI LISTS ----------
function renderUnitsList(){
  const p=state.program;if(!p.confirmed)return;const units=p.units;$('unitsContextBanner').innerHTML=`<strong>${units.length} unidades planificadas</strong> · ${esc(gradeLabel(p.grades))} · Cada unidad muestra su número y la fecha o periodo de trabajo recuperado de la programación. Puedes generar y descargar una unidad individual o todas en ZIP.`;
  if(!units.length){$('unitsList').innerHTML='<div class="warning-box">No se identificaron experiencias en la programación.</div>';return}
  $('unitsList').innerHTML=units.map(u=>{const gen=state.generatedUnits[u.id],areas=unitAreaSummary(u),sessions=gen?.sessions?.length||totalSessionTarget(u),dateLabel=unitDateLabel(u);return `<article class="doc-card" data-unit-card="${u.id}"><div class="doc-index">U${String(u.number).padStart(2,'0')}</div><div><div class="unit-date-line"><span class="date-badge">${esc(dateLabel)}</span></div><h4>${esc(u.title)}</h4><p>${u.period?`${esc(u.period)} · `:''}${sessions} sesiones propuestas</p><div class="doc-meta">${areas.map(n=>`<span class="meta-pill">${esc(n)}</span>`).join('')}${gen?'<span class="meta-pill ok">Generada</span>':''}</div></div><div class="doc-actions"><button class="btn tiny primary" data-gen-unit="${u.id}" type="button">${gen?'Regenerar':'Generar'}</button>${gen?`<button class="btn tiny secondary" data-view-unit="${u.id}" type="button">Ver</button><button class="btn tiny secondary" data-download-unit="${u.id}" type="button">Descargar unidad</button>`:''}</div></article>`}).join('');$('btnDownloadUnitsZip').disabled=Object.keys(state.generatedUnits).length!==p.units.length;
}
function renderSessionsList(){
  if(!state.program.confirmed)return;populateSessionAreaFilter();const p=state.program,areaId=activeSessionAreaId(),areaName=areaId==='all'?'todas las áreas':getArea(areaId)?.name||'el área seleccionada',studentInfo=(state.students?.names?.length?` · ${state.students.names.length} estudiantes cargados para los instrumentos`:' · Puedes importar la lista de estudiantes antes de descargar los instrumentos');$('sessionsContextBanner').innerHTML=`<strong>Mostrando ${esc(areaName)}</strong> · Las sesiones se generan desde las unidades integradas y se conservan organizadas por unidad y área curricular${studentInfo}.`;
  const unitEntries=Object.values(state.generatedUnits).sort((a,b)=>a.number-b.number);if(!unitEntries.length){$('sessionsList').innerHTML='<div class="info-box">Genera primero las unidades para habilitar sus sesiones.</div>';return}
  const visible=unitEntries.filter(ud=>filteredSessionsForUnit(ud,areaId).length);if(!visible.length){$('sessionsList').innerHTML='<div class="info-box">No hay sesiones previstas para el área seleccionada en las unidades generadas.</div>';return}
  $('sessionsList').innerHTML=visible.map(ud=>{const planned=filteredSessionsForUnit(ud,areaId),allGenerated=state.generatedSessions[ud.id]||[],generated=allGenerated.filter(g=>areaId==='all'||g.areaId===areaId);return `<section class="session-group"><div class="session-group-head"><div><h4>Unidad ${String(ud.number).padStart(2,'0')}: ${esc(ud.title)}</h4><small>${esc(unitDateLabel(ud))} · ${planned.length} sesiones previstas · ${generated.length} generadas</small></div><button class="btn tiny secondary" data-gen-unit-sessions="${ud.id}" type="button">Generar sesiones de esta unidad</button></div><div class="session-list">${planned.map(s=>{const g=allGenerated.find(x=>x.id===s.id),area=getArea(s.areaId);return `<div class="session-row"><div class="doc-index">S${String(s.number).padStart(2,'0')}</div><div><strong>${esc(s.title)}</strong><p><span class="session-area-tag">${esc(area?.name||s.areaId)}</span> ${esc(getComp(s.areaId,s.compId)?.name||'')}</p></div><div class="doc-actions"><button class="btn tiny primary" data-gen-session="${ud.id}|${s.id}" type="button">${g?'Regenerar':'Generar'}</button>${g?`<button class="btn tiny secondary" data-view-session="${ud.id}|${s.id}" type="button">Ver</button><button class="btn tiny secondary" data-download-session="${ud.id}|${s.id}" type="button">Word</button>`:''}</div></div>`}).join('')}</div></section>`}).join('');$('btnDownloadSessionsZip').disabled=!Object.values(state.generatedSessions).some(a=>a.length);updateSessionActionLabels();
}

// ---------- PREVIEW ----------
function areaPurposeText(block,d){const names=block.purposes.map(x=>`«${x.comp.name}»`).join(', ');return `Que los estudiantes desarrollen ${names} al abordar situaciones vinculadas con «${themeFromUnit(d)}», movilizando las capacidades correspondientes y comunicando sus aprendizajes mediante evidencias pertinentes.`}
function areaCriteriaText(block,cycle){return block.purposes.map(x=>`• ${x.criteria[cycle]}`).join(' ')}
function areaEvidenceText(block){return uniq(block.purposes.map(x=>x.evidence)).join(' / ')}
function unitPreviewHtml(d){
  const critHeaders=d.cycles.map(c=>`<th>NIVEL / CICLO ${c}</th>`).join('');
  const purposeRows=d.areaBlocks.map(block=>`<tr><td><b>${esc(block.area.name)}</b></td><td>${block.purposes.map((x,i)=>`${i+1}.- ${esc(x.comp.name)}`).join('<br>')}</td><td>${esc(areaPurposeText(block,d))}</td>${d.cycles.map(c=>`<td>${esc(areaCriteriaText(block,c))}</td>`).join('')}</tr><tr class="evidence-row"><td colspan="2"><b>EVIDENCIA</b></td><td colspan="${1+d.cycles.length}">${esc(areaEvidenceText(block))}</td></tr>`).join('');
  const weekCount=clamp(Math.ceil((d.days||20)/5),1,5),weeks=[];for(let w=1;w<=weekCount;w++){const ss=d.sessions.filter(s=>s.week===w);weeks.push(`<div class="doc-week"><h4>SEMANA ${String(w).padStart(2,'0')}</h4><ul>${ss.map(s=>`<li>SESIÓN ${String(s.number).padStart(2,'0')}: ${esc(s.title)}</li>`).join('')||'<li>—</li>'}</ul></div>`)}
  return `<div class="document-preview landscape"><div class="doc-title">EXPERIENCIA DE APRENDIZAJE ${String(d.number).padStart(2,'0')}${d.month?` - MES DE ${esc(d.month.toUpperCase())} ${esc(d.year)}`:''}</div><div class="doc-data-lines"><p><b>I. TÍTULO:</b> “${esc(d.title)}”</p><p><b>II. DURACIÓN:</b> ${esc(unitDurationText(d))}</p><p><b>III. INSTITUCIÓN:</b> ${esc(d.school||'')}</p></div><div class="doc-section-title">I. SITUACIÓN SIGNIFICATIVA</div><p class="doc-text">${esc(d.situation)}</p><div class="doc-section-title">II. PRODUCTO GENERAL</div><p class="doc-text">${esc(d.product)}</p><div class="doc-section-title">III. ENFOQUES TRANSVERSALES</div>${d.approaches.length?`<table class="doc-table"><tr><th>ENFOQUES TRANSVERSALES</th><th>ACCIONES O ACTITUDES</th></tr>${d.approaches.map(a=>`<tr><td>${esc(a)}</td><td>${esc(actionForApproach(a))}</td></tr>`).join('')}</table>`:'<p class="doc-text doc-muted">No se identificaron enfoques transversales específicos para esta unidad en la programación cargada.</p>'}<div class="doc-section-title">IV. PROPÓSITOS DE APRENDIZAJE</div><table class="doc-table compact integrated-purpose"><tr><th>ÁREA</th><th>COMPETENCIAS</th><th>PROPÓSITO</th>${critHeaders}</tr>${purposeRows||`<tr><td colspan="${3+d.cycles.length}">No se recuperó la distribución curricular de esta unidad. Revise la programación cargada.</td></tr>`}</table><div class="doc-section-title">V. SECUENCIA DIDÁCTICA DE SESIONES DE APRENDIZAJE</div><div class="doc-week-grid" style="grid-template-columns:repeat(${weekCount},1fr)">${weeks.join('')}</div><div class="doc-section-title">VI. EVALUACIÓN</div><p class="doc-text">${esc(d.evaluation)}</p><div class="doc-grid-2"><div><div class="doc-section-title">VII. RECURSOS</div><p class="doc-text">${esc(d.resources)}</p></div><div><div class="doc-section-title">VIII. BIBLIOGRAFÍA</div><p class="doc-text">${esc(d.bibliography)}</p></div></div><div class="doc-signature">${esc(d.month||'')}${d.year?`, ${esc(d.year)}`:''}<br><br>______________________________<br>${esc(d.teacher||'Docente responsable')}</div></div>`;
}

function sessionRoster(d){
  const current=state.students?.names||[];if(current.length)return current;
  if(Array.isArray(d.students)&&d.students.length)return d.students;
  return Array.from({length:15},()=> '');
}
function sessionDateText(d){return d.sessionDate||'____/____/______'}
function sessionPreviewHtml(d){
  const cycles=(d.cycles||[]).slice(0,3),approach=d.approaches[0];
  const evalCriteria=((d.evaluationCriteria&&d.evaluationCriteria.length)?d.evaluationCriteria:sessionEvaluationCriteria(d.areaId,d.comp,{title:d.title})).slice(0,3),roster=sessionRoster(d);
  const widths=[4.5,12.7,14.5,...cycles.map(()=>17.4),9.5,6.6];
  const cols=widths.map(w=>`<col style="width:${w}%">`).join('');
  const learningHead1=`<tr><th rowspan="2">ÁREA</th><th rowspan="2">COMPETENCIA</th><th rowspan="2">PROPÓSITO</th><th colspan="${cycles.length}">CRITERIOS</th><th rowspan="2">EVIDENCIA</th><th rowspan="2">INSTR.<br>EVAL.</th></tr>`;
  const learningHead2=`<tr>${cycles.map(c=>`<th>NIVEL ${esc(levelLabel(c))}</th>`).join('')}</tr>`;
  const learningBody=`<tr><td class="area-vertical">${esc(String(d.area.name||'').toUpperCase())}</td><td>${esc(d.comp?.name||'')}</td><td>${esc(d.purpose)}</td>${cycles.map(c=>`<td>${esc(d.criteria[c]||'')}</td>`).join('')}<td>${esc(d.evidence)}</td><td>${esc(d.instrument)}</td></tr>`;
  const evalColgroup=`<col style="width:4%"><col style="width:24%">${Array.from({length:9},()=>'<col style="width:8%">').join('')}`;
  const evalHead1=`<tr><th rowspan="3">N°</th><th rowspan="3">APELLIDOS Y NOMBRES</th><th colspan="9">CRITERIOS DE EVALUACIÓN</th></tr>`;
  const evalHead2=`<tr>${evalCriteria.map(c=>`<th colspan="3">${esc(c)}</th>`).join('')}</tr>`;
  const evalHead3=`<tr>${evalCriteria.map(()=>'<th>En inicio</th><th>En proceso</th><th>Logrado</th>').join('')}</tr>`;
  const evalRows=roster.map((name,i)=>`<tr><td>${String(i+1).padStart(2,'0')}</td><td class="student-name">${esc(name)}</td>${evalCriteria.map(()=>'<td></td><td></td><td></td>').join('')}</tr>`).join('');
  return `<div class="document-preview landscape session-reference">
    <div class="doc-title">SESIÓN DE APRENDIZAJE</div>
    <div class="doc-session-date">(${esc(sessionDateText(d))})</div>
    <div class="doc-section-title">I. &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; TÍTULO: “${esc(d.title)}”</div>
    <div class="doc-section-title"><u>II. &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; APRENDIZAJE ESPERADO:</u></div>
    <table class="doc-table session-learning"><colgroup>${cols}</colgroup>${learningHead1}${learningHead2}${learningBody}</table>
    ${approach?`<table class="doc-table session-approach"><colgroup><col style="width:45%"><col style="width:55%"></colgroup><tr><th>ENFOQUE TRANSVERSAL</th><th>ACCIONES O ACTITUDES</th></tr><tr><td>${esc(approach)}</td><td>${esc(actionForApproach(approach))}</td></tr></table>`:''}
    <div class="doc-section-title">III. DESARROLLO DE LA ACTIVIDAD:</div>
    <table class="doc-table session-sequence"><colgroup><col style="width:10%"><col style="width:63%"><col style="width:20%"><col style="width:7%"></colgroup><tr><th>MOMENTOS</th><th>ACTIVIDADES/ESTRATEGIAS</th><th>RECURSOS</th><th>TIEMPO</th></tr>${d.sequence.map(x=>`<tr><td><b>${esc(x.moment)}</b></td><td class="strategy-lines">${x.activities}</td><td>${esc(x.resources)}</td><td>${x.time}’</td></tr>`).join('')}</table>
    <div class="doc-section-title session-eval-start">IV. EVALUACIÓN: Se aplicará una ${esc(d.instrument.toLowerCase())}.</div>
    <div class="doc-check-title">${esc(d.instrument.toUpperCase())}</div>
    <table class="doc-table checklist-table"><colgroup>${evalColgroup}</colgroup>${evalHead1}${evalHead2}${evalHead3}${evalRows}</table>
    <div class="doc-signature">______________________________<br>${esc(d.teacher||'Docente responsable')}</div>
  </div>`;
}

function openPreview(type,id,subId=''){
  let data;if(type==='unit')data=state.generatedUnits[id];else data=(state.generatedSessions[id]||[]).find(x=>x.id===subId);if(!data)return;currentPreview={type,id,subId,data};$('previewTitle').textContent=type==='unit'?`Unidad ${String(data.number).padStart(2,'0')}`:`Sesión ${String(data.number).padStart(2,'0')}`;$('previewStage').innerHTML=type==='unit'?unitPreviewHtml(data):sessionPreviewHtml(data);$('previewModal').classList.remove('hidden');
}
function closePreview(){$('previewModal').classList.add('hidden');currentPreview=null}
function printPreview(){if(!currentPreview)return;const html=currentPreview.type==='unit'?unitPreviewHtml(currentPreview.data):sessionPreviewHtml(currentPreview.data);const w=window.open('','_blank');if(!w){toast('El navegador bloqueó la ventana de impresión.');return}w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Documento</title><style>${printCss()}</style></head><body>${html}</body></html>`);w.document.close();setTimeout(()=>w.print(),300)}
function printCss(){return `@page{size:A4 landscape;margin:8mm}body{margin:0;font-family:Arial,sans-serif;color:#111}.document-preview{width:auto!important;min-height:0!important;padding:0!important;box-shadow:none!important}.doc-title{text-align:center;font-size:10.5px;font-weight:400;text-decoration:underline;margin:0 0 2px}.doc-session-date{text-align:right;font-size:8.5px;margin:0 0 12px}.doc-section-title{font-size:9.5px;font-weight:400;margin:8px 0 4px}.doc-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7px;margin:2px auto 6px}.doc-table th,.doc-table td{border:1px solid #111;padding:2px 3px;vertical-align:top;overflow-wrap:normal;word-break:normal}.doc-table th{background:#fff;text-align:center;font-weight:400}.session-learning{font-size:6.8px}.session-learning .area-vertical{writing-mode:vertical-rl;transform:rotate(180deg);text-align:center;vertical-align:middle;font-weight:700}.session-approach{font-size:6.8px}.session-approach th,.session-approach td{text-align:center;vertical-align:middle;padding:1px 3px}.session-sequence{font-size:7.1px}.session-sequence .strategy-lines b{display:inline-block;margin-top:2px}.session-eval-start{break-before:page}.doc-check-title{text-align:center;font-size:9px;font-weight:bold;margin:4px 0 2px}.checklist-table{font-size:6.2px}.checklist-table th,.checklist-table td{padding:1.5px 2px;vertical-align:middle}.checklist-table .student-name{text-align:left}.doc-signature{text-align:center;font-size:8px;margin-top:14px}.doc-data-lines{font-size:9px}.doc-text{font-size:8px;text-align:justify;line-height:1.2}.doc-week-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.doc-week{border:1px solid #222}.doc-week h4{font-size:8px;text-align:center;margin:0;padding:4px}.doc-week ul{font-size:7px;margin:5px 5px 5px 16px;padding:0}`;}


// ---------- DOCX WRITER + ZIP ----------
const encoder=new TextEncoder();
function xmlEsc(s=''){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
function le16(n){return new Uint8Array([n&255,(n>>>8)&255])}
function le32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function concat(arrs){const len=arrs.reduce((a,b)=>a+b.length,0),out=new Uint8Array(len);let o=0;for(const a of arrs){out.set(a,o);o+=a.length}return out}
function makeZip(entries){
  const locals=[],centrals=[];let offset=0;for(const ent of entries){const name=encoder.encode(ent.name),data=ent.data instanceof Uint8Array?ent.data:encoder.encode(ent.data),crc=crc32(data);const local=concat([le32(0x04034b50),le16(20),le16(0),le16(0),le16(0),le16(0),le32(crc),le32(data.length),le32(data.length),le16(name.length),le16(0),name,data]);locals.push(local);const central=concat([le32(0x02014b50),le16(20),le16(20),le16(0),le16(0),le16(0),le16(0),le32(crc),le32(data.length),le32(data.length),le16(name.length),le16(0),le16(0),le16(0),le16(0),le32(0),le32(offset),name]);centrals.push(central);offset+=local.length}
  const cd=concat(centrals),body=concat(locals),end=concat([le32(0x06054b50),le16(0),le16(0),le16(entries.length),le16(entries.length),le32(cd.length),le32(body.length),le16(0)]);return concat([body,cd,end]);
}
function wRun(text,bold=false,size=20,underline=false){return `<w:r><w:rPr>${bold?'<w:b/>':''}${underline?'<w:u w:val="single"/>':''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`}
function wP(text='',opt={}){const align=opt.align?`<w:jc w:val="${opt.align}"/>`:'';const spacing=`<w:spacing w:before="${opt.before??0}" w:after="${opt.after??50}" w:line="${opt.line??240}" w:lineRule="auto"/>`;const keep=opt.keepNext?'<w:keepNext/>':'';return `<w:p><w:pPr>${align}${spacing}${keep}</w:pPr>${wRun(text,!!opt.bold,opt.size||20,!!opt.underline)}</w:p>`}
function wPageBreak(){return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'}
function wRichLine(line,opt={}){const m=String(line??'').match(/^([^:]{2,55}:)\s*(.*)$/);const align=opt.align?`<w:jc w:val="${opt.align}"/>`:'';const spacing=`<w:spacing w:after="${opt.after??14}" w:line="${opt.line??205}" w:lineRule="auto"/>`;if(!m)return `<w:p><w:pPr>${align}${spacing}</w:pPr>${wRun(String(line??''),!!opt.bold,opt.size||16)}</w:p>`;return `<w:p><w:pPr>${align}${spacing}</w:pPr>${wRun(m[1],true,opt.size||16)}${wRun(m[2],false,opt.size||16)}</w:p>`}
function wCell(text,opt={}){const shade=opt.shade?`<w:shd w:fill="${opt.shade}"/>`:'';const width=opt.width?`<w:tcW w:w="${opt.width}" w:type="dxa"/>`:'';const span=opt.span&&opt.span>1?`<w:gridSpan w:val="${opt.span}"/>`:'';const vm=opt.vMerge?`<w:vMerge${opt.vMerge==='restart'?' w:val="restart"':''}/>`:'';const valign=`<w:vAlign w:val="${opt.vAlign||'top'}"/>`;const dir=opt.textDirection?`<w:textDirection w:val="${opt.textDirection}"/>`:'';const margins=opt.cellMargin!=null?`<w:tcMar><w:top w:w="${opt.cellMargin}" w:type="dxa"/><w:left w:w="${opt.cellMargin}" w:type="dxa"/><w:bottom w:w="${opt.cellMargin}" w:type="dxa"/><w:right w:w="${opt.cellMargin}" w:type="dxa"/></w:tcMar>`:'';const lines=String(text??'').split(/\n+/);const body=lines.map(line=>opt.richLabels?wRichLine(line,{bold:opt.bold,size:opt.size||16,align:opt.align||'left',after:opt.pAfter??12,line:opt.line??205}):wP(line,{bold:opt.bold,size:opt.size||16,align:opt.align||'left',after:opt.pAfter??12,line:opt.line??205})).join('');return `<w:tc><w:tcPr>${width}${shade}${span}${vm}${valign}${dir}${margins}</w:tcPr>${body}</w:tc>`}
function wTable(rows,opt={}){const widths=opt.widths||[],total=widths.reduce((a,b)=>a+b,0),grid=widths.length?`<w:tblGrid>${widths.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`:'';const layout=opt.fixed!==false?'<w:tblLayout w:type="fixed"/>':'';const jc=`<w:jc w:val="${opt.align||'center'}"/>`;const tblW=total?`<w:tblW w:w="${total}" w:type="dxa"/>`:'<w:tblW w:w="0" w:type="auto"/>';const borders=`<w:tblBorders><w:top w:val="single" w:sz="4" w:color="111111"/><w:left w:val="single" w:sz="4" w:color="111111"/><w:bottom w:val="single" w:sz="4" w:color="111111"/><w:right w:val="single" w:sz="4" w:color="111111"/><w:insideH w:val="single" w:sz="4" w:color="111111"/><w:insideV w:val="single" w:sz="4" w:color="111111"/></w:tblBorders>`;const rowsXml=rows.map((row,ri)=>{let logical=0;const cells=row.map(cell=>{const o=typeof cell==='object'?cell:{text:cell},span=Number(o.span||1),cw=o.width||(widths.length?widths.slice(logical,logical+span).reduce((a,b)=>a+b,0):0);const x=wCell(o.text,{bold:o.bold??(opt.headerRows?ri<opt.headerRows:ri===0),shade:o.shade??((opt.shadeHeaders!==false&&(opt.headerRows?ri<opt.headerRows:ri===0))?'EAF0F5':''),width:cw,size:o.size||opt.size||16,align:o.align||((opt.headerRows?ri<opt.headerRows:ri===0)?'center':'left'),span,vMerge:o.vMerge||'',vAlign:o.vAlign||'top',textDirection:o.textDirection||'',cellMargin:o.cellMargin??opt.cellMargin??28,richLabels:o.richLabels??opt.richLabels??false,line:o.line||opt.line||205,pAfter:o.pAfter??opt.pAfter??12});logical+=span;return x}).join('');return `<w:tr><w:trPr>${opt.cantSplit!==false?'<w:cantSplit/>':''}${opt.headerRows&&ri<opt.headerRows?'<w:tblHeader/>':''}</w:trPr>${cells}</w:tr>`}).join('');return `<w:tbl><w:tblPr>${tblW}${layout}${jc}${borders}</w:tblPr>${grid}${rowsXml}</w:tbl>`}
function sectPr(landscape=true,margin=600){const portraitMargin=Math.max(650,margin);return landscape?`<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="350" w:footer="350" w:gutter="0"/></w:sectPr>`:`<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${portraitMargin}" w:right="${portraitMargin}" w:bottom="${portraitMargin}" w:left="${portraitMargin}" w:header="350" w:footer="350" w:gutter="0"/></w:sectPr>`}
function docxPackage(bodyXml,landscape=true,opt={}){
  const margin=opt.margin||600,font=opt.font||'Arial',baseSize=opt.baseSize||20;
  const document=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}${sectPr(landscape,margin)}</w:body></w:document>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="${xmlEsc(font)}" w:hAnsi="${xmlEsc(font)}"/><w:sz w:val="${baseSize}"/></w:rPr></w:style></w:styles>`;
  const ct=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const rel=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const drel=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return makeZip([{name:'[Content_Types].xml',data:ct},{name:'_rels/.rels',data:rel},{name:'word/document.xml',data:document},{name:'word/styles.xml',data:styles},{name:'word/_rels/document.xml.rels',data:drel}]);
}
function unitDocx(d){
  let b=wP(`EXPERIENCIA DE APRENDIZAJE ${String(d.number).padStart(2,'0')}${d.month?` - MES DE ${String(d.month).toUpperCase()} ${d.year}`:''}`,{bold:true,size:28,align:'center',after:80});
  b+=wP(`I. TÍTULO : “${d.title}”`,{bold:true,size:20,after:30})+wP(`II. DURACIÓN : ${unitDurationText(d)}`,{bold:true,size:20,after:30})+wP(`III. INSTITUCIÓN : ${d.school||''}`,{bold:true,size:20,after:70});
  b+=wP('I. SITUACIÓN SIGNIFICATIVA',{bold:true,size:20,after:35})+wP(d.situation,{size:18,after:60});b+=wP('II. PRODUCTO GENERAL',{bold:true,size:20,after:35})+wP(d.product,{size:18,after:60});
  b+=wP('III. ENFOQUES TRANSVERSALES',{bold:true,size:20,after:35});b+=d.approaches.length?wTable([['ENFOQUES TRANSVERSALES','ACCIONES O ACTITUDES'],...d.approaches.map(a=>[a,actionForApproach(a)])],{widths:[4200,9000],size:16}):wP('No se identificaron enfoques transversales específicos en la programación cargada.',{size:17});
  b+=wP('IV. PROPÓSITOS DE APRENDIZAJE',{bold:true,size:20,after:35});const hdr=['ÁREA','COMPETENCIAS','PROPÓSITO',...d.cycles.map(c=>`CRITERIOS ${c}`)];const rows=[hdr];for(const block of d.areaBlocks){rows.push([block.area.name,block.purposes.map((x,i)=>`${i+1}.- ${x.comp.name}`).join('\n'),areaPurposeText(block,d),...d.cycles.map(c=>areaCriteriaText(block,c))]);rows.push(['EVIDENCIA',block.area.name,areaEvidenceText(block),...d.cycles.map(()=>areaEvidenceText(block))])}b+=wTable(rows,{size:13});
  b+=wP('V. SECUENCIA DIDÁCTICA DE SESIONES DE APRENDIZAJE',{bold:true,size:20,after:35});const weekCount=clamp(Math.ceil((d.days||20)/5),1,5),weekRows=[Array.from({length:weekCount},(_,i)=>`SEMANA ${String(i+1).padStart(2,'0')}`),Array.from({length:weekCount},(_,w)=>d.sessions.filter(s=>s.week===w+1).map(s=>`SESIÓN ${String(s.number).padStart(2,'0')}: ${s.title}`).join('\n')||'—')];b+=wTable(weekRows,{size:13});
  b+=wP('VI. EVALUACIÓN',{bold:true,size:20,after:35})+wP(d.evaluation,{size:17});b+=wP('VII. RECURSOS',{bold:true,size:20,after:35})+wP(d.resources,{size:17});b+=wP('VIII. BIBLIOGRAFÍA',{bold:true,size:20,after:35})+wP(d.bibliography,{size:17});b+=wP('______________________________',{align:'center',size:18,after:0})+wP(d.teacher||'Docente responsable',{align:'center',size:17});return docxPackage(b,true);
}

function htmlToPlain(s){const d=document.createElement('div');d.innerHTML=s;return d.textContent||d.innerText||''}
function htmlToPlainWithBreaks(s){const normalized=String(s||'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/p>/gi,'\n');const d=document.createElement('div');d.innerHTML=normalized;return (d.textContent||d.innerText||'').replace(/\n{3,}/g,'\n\n').trim()}
function sessionDocx(d){
  const cycles=(d.cycles||[]).slice(0,3),margin=500,total=16838-(margin*2);
  const learningWidths=[713,2011,2297,...cycles.map(()=>2756),1505,1045];
  const diff=total-learningWidths.reduce((a,b)=>a+b,0);learningWidths[learningWidths.length-1]+=diff;
  let b=wP('SESIÓN DE APRENDIZAJE',{size:19,align:'center',underline:true,after:4,line:210})
    +wP(`(${sessionDateText(d)})`,{size:17,align:'right',after:80,line:205})
    +wP(`I.        TÍTULO: “${d.title}”`,{size:18,after:40,line:210})
    +wP('II.       APRENDIZAJE ESPERADO:',{size:18,underline:true,after:30,line:210});
  const row1=[
    {text:'ÁREA',vMerge:'restart',vAlign:'center'},
    {text:'COMPETENCIA',vMerge:'restart',vAlign:'center'},
    {text:'PROPÓSITO',vMerge:'restart',vAlign:'center'},
    {text:'CRITERIOS',span:cycles.length,vAlign:'center'},
    {text:'EVIDENCIA',vMerge:'restart',vAlign:'center'},
    {text:'INSTR.\nEVAL.',vMerge:'restart',vAlign:'center'}
  ];
  const row2=[
    {text:'',vMerge:'continue'},{text:'',vMerge:'continue'},{text:'',vMerge:'continue'},
    ...cycles.map(c=>({text:`NIVEL ${levelLabel(c)}`,vAlign:'center'})),
    {text:'',vMerge:'continue'},{text:'',vMerge:'continue'}
  ];
  const row3=[
    {text:String(d.area.name||'').toUpperCase(),textDirection:'btLr',align:'center',vAlign:'center',bold:true,size:14},
    {text:d.comp?.name||'',size:14},
    {text:d.purpose,size:14},
    ...cycles.map(c=>({text:d.criteria[c]||'',size:14})),
    {text:d.evidence,size:14},
    {text:d.instrument,size:14,vAlign:'center'}
  ];
  b+=wTable([row1,row2,row3],{widths:learningWidths,size:14,headerRows:2,shadeHeaders:false,cellMargin:24,line:190,pAfter:8});
  if(d.approaches[0])b+=wTable([
    [{text:'ENFOQUE TRANSVERSAL',bold:false,align:'center'},{text:'ACCIONES O ACTITUDES',bold:false,align:'center'}],
    [{text:d.approaches[0],align:'center'},{text:actionForApproach(d.approaches[0]),align:'center'}]
  ],{widths:[Math.round(total*.45),total-Math.round(total*.45)],size:14,headerRows:1,shadeHeaders:false,cellMargin:16,line:185,pAfter:5});
  b+=wP('III. DESARROLLO DE LA ACTIVIDAD:',{bold:true,size:18,after:28,line:205});
  const sequenceWidths=[Math.round(total*.10),Math.round(total*.63),Math.round(total*.20),0];sequenceWidths[3]=total-sequenceWidths.slice(0,3).reduce((a,b)=>a+b,0);
  b+=wTable([
    [{text:'MOMENTOS',align:'center'},{text:'ACTIVIDADES/ESTRATEGIAS',align:'center'},{text:'RECURSOS',align:'center'},{text:'TIEMPO',align:'center'}],
    ...d.sequence.map(x=>[
      {text:x.moment,bold:true,size:14},
      {text:htmlToPlainWithBreaks(x.activities),size:14,richLabels:true},
      {text:x.resources,size:14},
      {text:`${x.time}’`,size:14,align:'center'}
    ])
  ],{widths:sequenceWidths,size:14,headerRows:1,shadeHeaders:false,cellMargin:24,line:190,pAfter:6,richLabels:false});
  b+=wPageBreak()+wP(`IV. EVALUACIÓN: Se aplicará una ${String(d.instrument||'lista de cotejo').toLowerCase()}.`,{bold:true,size:18,after:18,line:205});
  b+=wP(String(d.instrument||'LISTA DE COTEJO').toUpperCase(),{bold:true,size:18,align:'center',after:20,line:205});
  const evalCriteria=((d.evaluationCriteria&&d.evaluationCriteria.length)?d.evaluationCriteria:sessionEvaluationCriteria(d.areaId,d.comp,{title:d.title})).slice(0,3),roster=sessionRoster(d);
  const evalWidths=[560,3900,...Array(9).fill(0)];const rem=total-4460,each=Math.floor(rem/9);for(let i=2;i<10;i++)evalWidths[i]=each;evalWidths[10]=total-evalWidths.slice(0,10).reduce((a,b)=>a+b,0);
  const evalRows=[
    [{text:'N°',bold:true,align:'center',vMerge:'restart',vAlign:'center'},{text:'APELLIDOS Y NOMBRES',bold:true,align:'center',vMerge:'restart',vAlign:'center'},{text:'CRITERIOS DE EVALUACIÓN',bold:true,align:'center',span:9,vAlign:'center'}],
    [{text:'',vMerge:'continue'},{text:'',vMerge:'continue'},...evalCriteria.map(c=>({text:c,bold:true,align:'center',span:3,vAlign:'center',size:12}))],
    [{text:'',vMerge:'continue'},{text:'',vMerge:'continue'},...evalCriteria.flatMap(()=>['En inicio','En proceso','Logrado'].map(t=>({text:t,bold:true,align:'center',vAlign:'center',size:11})))],
    ...roster.map((name,i)=>[
      {text:String(i+1).padStart(2,'0'),align:'center',vAlign:'center',size:12},
      {text:name,size:12,vAlign:'center'},
      ...Array(9).fill('').map(()=>({text:'',size:11,vAlign:'center'}))
    ])
  ];
  b+=wTable(evalRows,{widths:evalWidths,size:12,headerRows:3,shadeHeaders:false,cellMargin:18,line:175,pAfter:2});
  b+=wP('______________________________',{align:'center',size:16,after:0,before:65,line:190})+wP(d.teacher||'Docente responsable',{align:'center',size:15,after:0,line:190});
  return docxPackage(b,true,{font:'Arial',baseSize:18,margin});
}


function downloadBytes(bytes,name,type='application/octet-stream'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},600)}
function downloadUnit(id){const d=state.generatedUnits[id];if(!d)return;downloadBytes(unitDocx(d),`Unidad_${String(d.number).padStart(2,'0')}_${unitDateFileTag(d)}_${slug(d.title)}.docx`,'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}
function downloadSession(uid,sid){const d=(state.generatedSessions[uid]||[]).find(x=>x.id===sid);if(!d)return;downloadBytes(sessionDocx(d),`Sesion_${String(d.number).padStart(2,'0')}_${slug(d.area?.name||'area')}_${slug(d.title)}.docx`,'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}
function downloadUnitsZip(){const folder=`Unidades_Integradas_${state.program.year}`,entries=[];for(const d of Object.values(state.generatedUnits).sort((a,b)=>a.number-b.number))entries.push({name:`${folder}/Unidad_${String(d.number).padStart(2,'0')}_${unitDateFileTag(d)}_${slug(d.title)}.docx`,data:unitDocx(d)});if(!entries.length){toast('Primero genera las unidades.');return}downloadBytes(makeZip(entries),`${folder}.zip`,'application/zip');toast('ZIP de unidades integradas preparado.');}
function downloadSessionsZip(){const areaId=activeSessionAreaId(),areaLabel=areaId==='all'?'Todas_las_areas':slug(getArea(areaId)?.name||'Area'),folder=`Sesiones_${areaLabel}_${state.program.year}`,entries=[];for(const ud of Object.values(state.generatedUnits).sort((a,b)=>a.number-b.number)){const arr=(state.generatedSessions[ud.id]||[]).filter(s=>areaId==='all'||s.areaId===areaId).sort((a,b)=>a.number-b.number);for(const s of arr){const areaFolder=slug(s.area?.name||getArea(s.areaId)?.name||s.areaId);entries.push({name:`${folder}/Unidad_${String(ud.number).padStart(2,'0')}/${areaFolder}/Sesion_${String(s.number).padStart(2,'0')}_${slug(s.title)}.docx`,data:sessionDocx(s)})}}if(!entries.length){toast('Primero genera las sesiones del área seleccionada.');return}downloadBytes(makeZip(entries),`${folder}.zip`,'application/zip');toast('ZIP de sesiones preparado y organizado por unidad y área.');}

// ---------- EVENTS ----------
function hydrateFromState(){
  renderChecks();renderStudents();if(state.source.name)$('programFileState').textContent=`Archivo guardado: ${state.source.name}`;if(state.program.units.length){renderAnalysis();if(state.program.confirmed){$('analysisBadge').textContent='Confirmada';$('analysisBadge').className='badge ok';renderUnitsList();populateSessionAreaFilter();renderSessionsList();updateStepAccess();}}renderChecks();
}
function bind(){
  $$('.step-tab').forEach(b=>b.addEventListener('click',()=>setStep(Number(b.dataset.step))));$('btnSaveProject').addEventListener('click',()=>saveProject(false));$('btnResetProject').addEventListener('click',resetProject);
  const dz=$('programDropZone'),fi=$('programFile');['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('dragging')}));['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('dragging')}));dz.addEventListener('drop',e=>{const f=e.dataTransfer.files?.[0];if(f){droppedProgramFile=f;handleFileState(f)}});fi.addEventListener('change',()=>{const f=fi.files?.[0];if(f){droppedProgramFile=null;handleFileState(f)}});
  $('btnAnalyzeProgram').addEventListener('click',analyzeProgramClick);$('detectedGrades').addEventListener('change',renderWarnings);['detectedSchool','detectedTeacher','detectedYear','detectedPeriodType'].forEach(id=>$(id).addEventListener('input',renderWarnings));
  $('detectedUnitsEditor').addEventListener('input',()=>renderWarnings());$('detectedUnitsEditor').addEventListener('click',e=>{const id=e.target.dataset.deleteUnit;if(id){state.program.units=state.program.units.filter(u=>u.id!==id);state.program.units.forEach((u,i)=>{u.number=i+1;u.id=`u${i+1}`});$('detectedUnitCount').textContent=state.program.units.length;renderDetectedUnits();renderWarnings()}});
  $('btnAddDetectedUnit').addEventListener('click',()=>{const i=state.program.units.length+1;state.program.units.push({id:`u${i}`,number:i,month:'',days:0,dateText:'',startDate:'',endDate:'',period:'',title:`Unidad ${String(i).padStart(2,'0')}`,situation:'',calendar:'',problems:'',potential:'',needs:'',competenciesByArea:{},approaches:[],sessionCount:0});$('detectedUnitCount').textContent=state.program.units.length;renderDetectedUnits();renderWarnings()});$('btnConfirmProgram').addEventListener('click',confirmProgram);
  $('btnGenerateAllUnits').addEventListener('click',generateAllUnits);$('btnDownloadUnitsZip').addEventListener('click',downloadUnitsZip);$('unitsList').addEventListener('click',e=>{const g=e.target.dataset.genUnit,v=e.target.dataset.viewUnit,d=e.target.dataset.downloadUnit;if(g)generateOneUnit(g);if(v)openPreview('unit',v);if(d)downloadUnit(d)});
  $('sessionAreaFilter').addEventListener('change',e=>{state.program.sessionAreaId=e.target.value||'all';updateSessionActionLabels();renderSessionsList();saveProject(true)});
  $('btnSaveStudents').addEventListener('click',saveStudentsEditor);$('btnClearStudents').addEventListener('click',clearStudents);
  $('studentsFile').addEventListener('change',e=>{const f=e.target.files?.[0];if(f)autoImportStudents(f);});
  $('btnGenerateAllSessions').addEventListener('click',generateAllSessions);$('btnDownloadSessionsZip').addEventListener('click',downloadSessionsZip);$('sessionsList').addEventListener('click',e=>{const gu=e.target.dataset.genUnitSessions;if(gu){generateSessionsForUnit(gu);return}const gs=e.target.dataset.genSession,vs=e.target.dataset.viewSession,ds=e.target.dataset.downloadSession;if(gs){const [u,s]=gs.split('|');generateOneSession(u,s)}if(vs){const [u,s]=vs.split('|');openPreview('session',u,s)}if(ds){const [u,s]=ds.split('|');downloadSession(u,s)}});
  $('btnClosePreview').addEventListener('click',closePreview);$('previewModal').addEventListener('click',e=>{if(e.target===$('previewModal'))closePreview()});$('btnPreviewPrint').addEventListener('click',printPreview);$('btnPreviewDownload').addEventListener('click',()=>{if(!currentPreview)return;if(currentPreview.type==='unit')downloadUnit(currentPreview.id);else downloadSession(currentPreview.id,currentPreview.subId)});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('previewModal').classList.contains('hidden'))closePreview()});
}
function handleFileState(f){state.source.name=f.name;state.source.type=f.type;$('programFileState').textContent=`Seleccionado: ${f.name}`;renderChecks()}
async function analyzeProgramClick(){
  const file=$('programFile').files?.[0]||droppedProgramFile,fallback=$('programTextFallback').value.trim();if(!file&&!fallback){toast('Selecciona una programación o pega su contenido.');return}
  const btn=$('btnAnalyzeProgram');btn.disabled=true;btn.textContent='Analizando…';try{let struct;if(file){struct=await readProgramFile(file);state.source.name=file.name;state.source.type=file.type}else struct={paragraphs:fallback.split(/\n+/),tables:[],blocks:[],text:fallback};if(fallback&&(!struct.text||struct.text.length<200))struct.text=fallback;state.source.text=struct.text;state.source.structured=struct;state.program=analyzeStructured(struct);state.generatedUnits={};state.generatedSessions={};renderAnalysis();populateSessionAreaFilter();updateStepAccess();saveProject(true);toast(`Se identificaron ${state.program.units.length} experiencias y ${state.program.areas.length} áreas curriculares. Revisa la información y confirma la programación.`);}catch(err){console.error(err);toast(`No se pudo analizar el archivo: ${err.message}`)}finally{btn.disabled=false;btn.textContent='Analizar programación'}
}

bind();renderStudents();renderChecks();initStartup();
})();
