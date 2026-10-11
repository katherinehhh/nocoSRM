import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js/node';
import {existsSync} from 'node:fs';
import {TemplateSchema,type Delivery,type DeliveryLine} from '../../../shared/showcase.js';
import {ShowcaseError} from './service.js';
export async function deliveryPdf(record:Delivery,config:unknown){
 const template=TemplateSchema.parse(config),lines=JSON.parse(record.lines) as DeliveryLine[];
 const doc=new PDFDocument({size:'A4',margin:24,autoFirstPage:true,bufferPages:true});const chunks:Buffer[]=[];const done=new Promise<Buffer>((resolve,reject)=>{doc.on('data',(chunk:Buffer)=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 const font=process.env.SHOWCASE_PRINT_FONT??'/System/Library/Fonts/STHeiti Light.ttc';if(!existsSync(font))throw new ShowcaseError('PRINT_FONT_UNCONFIGURED');doc.registerFont('Business',font,font.endsWith('.ttc')?'STHeitiSC-Light':undefined).font('Business');
 const zh=template.locale==='zh-CN';const labels:Record<string,string>=zh?{sku:'SKU',name:'名称',orderId:'采购单',fnsku:'FNSKU',region:'要货大区',allocation:'分配数量',unitsPerBox:'箱入数',boxes:'箱数'}:{sku:'SKU',name:'Name',orderId:'Order',fnsku:'FNSKU',region:'Region',allocation:'Allocation',unitsPerBox:'Units/box',boxes:'Boxes'};
 doc.fontSize(12).text(template.title,24,24);doc.fontSize(8).text(`${record.number} · ${record.businessDate}`,24,46);const width=547/template.columns.length;let y=66;
 const row=(values:string[],header=false)=>{doc.fontSize(header?8:7);values.forEach((value,i)=>{doc.rect(24+i*width,y,width,32).stroke();doc.text(value,27+i*width,y+5,{width:width-6,height:26,ellipsis:true});});y+=32;};row(template.columns.map(c=>labels[c]),true);
 for(const line of lines){if(y>750){doc.addPage();y=24;row(template.columns.map(c=>labels[c]),true);}row(template.columns.map(c=>String(c==='orderId'?record.orderId:c==='region'?record.region:c==='boxes'?Math.ceil(line.allocation/line.unitsPerBox):line[c as keyof DeliveryLine])));}
 doc.fontSize(8).text(zh?'此页为报表汇总，以下含有条形码。':'Summary report. Barcode labels follow.',24,y+8);
 const count=template.labelCount,perPage=template.labelColumns*template.labelRows,w=547/template.labelColumns,h=794/template.labelRows;
 for(let i=0;i<count;i++){if(i%perPage===0)doc.addPage();const local=i%perPage,x=24+(local%template.labelColumns)*w,top=24+Math.floor(local/template.labelColumns)*h,line=lines[i%lines.length]!;doc.fontSize(7).text(`${line.sku} (${i+1}/${count})`,x+4,top+5,{width:w-8,align:'center'});const barcode=await bwipjs.toBuffer({bcid:'code128',text:line.fnsku,scale:3,height:10,includetext:true,textxalign:'center'});doc.image(barcode,x+6,top+20,{fit:[w-12,Math.min(54,h-50)],align:'center'});doc.fontSize(6).text(`New   Made In China   ${record.region}`,x+4,top+Math.min(78,h-15),{width:w-8,align:'center'});}
 doc.end();return done;
}
