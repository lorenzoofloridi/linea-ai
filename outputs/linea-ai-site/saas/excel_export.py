"""Portable XLSX export: no external runtime, formulas or private credentials."""
import io,json,zipfile,re
from xml.sax.saxutils import escape

def workbook(data):
 sheets=[]
 def add(name,headers,rows):sheets.append((name,[headers]+rows))
 def value(v):return json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else str(v if v is not None else '')
 def flatten(v,path=''):
  if isinstance(v,dict):
   for k,x in v.items():yield from flatten(x,path+' / '+k if path else k)
  elif isinstance(v,list):
   for i,x in enumerate(v):yield from flatten(x,path+' / '+str(i+1))
  else:yield [path,value(v)]
 cfg=data['company_configuration']
 add('Guida',['Voce','Descrizione'],[['Azienda',cfg['name']],['Esportato il',data['exported_at']],['Come leggere','Richieste: contatti raccolti. Messaggi: cronologia. Gli altri fogli contengono configurazione e dettagli.'],['Date','Date e ore riportate con il fuso indicato nel dato originale.'],['Riservatezza','Contiene dati aziendali e personali. Conservare e condividere solo con persone autorizzate.']])
 leads=data['leads'];decoded=[json.loads(x['data']) if isinstance(x['data'],str) else x['data'] for x in leads]
 keys=list(dict.fromkeys([f['key'] for f in cfg['fields']]+[k for row in decoded for k in row]));labels={f['key']:f['label'] for f in cfg['fields']}
 add('Richieste',['Codice','Data','Stato']+[labels.get(k,k.replace('_',' ').capitalize()) for k in keys]+['Riepilogo','Consenso'],[[x['id'],x['created_at'],x['status']]+[value(d.get(k,'')) for k in keys]+[x['summary'],x['consent']] for x,d in zip(leads,decoded)])
 for name,key,columns in [('Conversazioni','conversations',{'id':'Codice','created_at':'Inizio','updated_at':'Ultimo aggiornamento'}),('Messaggi','messages',{'conversation_id':'Conversazione','role':'Autore','content':'Messaggio','created_at':'Data'}),('Feedback','feedback',{'conversation_id':'Conversazione','rating':'Valutazione','comment':'Commento'})]:
  add(name,list(columns.values()),[[value(x.get(k)) for k in columns] for x in data[key]])
 for name,key in [('Configurazione','company_configuration'),('Azienda','company_information'),('Attività agente','agent_activity')]:add(name,['Informazione','Valore'],list(flatten(data[key])))
 def col(n):
  s=''
  while n:n,a=divmod(n-1,26);s=chr(65+a)+s
  return s
 out=io.BytesIO();ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
  z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1,len(sheets)+1))+'</Types>')
  z.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  z.writestr('xl/workbook.xml',f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>' for i,(name,_) in enumerate(sheets,1))+'</sheets></workbook>')
  z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1,len(sheets)+1))+f'<Relationship Id="style" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
  z.writestr('xl/styles.xml',f'<styleSheet xmlns="{ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF142C3C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs></styleSheet>')
  for i,(_,rows) in enumerate(sheets,1):
   cells=[]
   for ri,row in enumerate(rows,1):
    cs=[]
    for ci,v in enumerate(row,1):
     text=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]','',value(v))[:32767]
     cs.append(f'<c r="{col(ci)}{ri}" t="inlineStr" s="{1 if ri==1 else 0}"><is><t xml:space="preserve">{escape(text)}</t></is></c>')
    cells.append(f'<row r="{ri}" ht="{30 if ri==1 else 60}" customHeight="1">'+''.join(cs)+'</row>')
   z.writestr(f'xl/worksheets/sheet{i}.xml',f'<worksheet xmlns="{ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="{len(rows[0])}" width="32" customWidth="1"/></cols><sheetData>'+''.join(cells)+f'</sheetData><autoFilter ref="A1:{col(len(rows[0]))}{len(rows)}"/></worksheet>')
 return out.getvalue()
