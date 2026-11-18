import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {NodeDatabase} from '../lib/server/node-database.ts';
const moduleUrl=async(path,replacements={})=>{let s=stripTypeScriptTypes(await fs.readFile(new URL(path,import.meta.url),'utf8'));for(const[a,b]of Object.entries(replacements))s=s.replaceAll(a,b);return `data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;};
const gallery=await moduleUrl('../lib/gallery-policy.ts');
const validation=await moduleUrl('../lib/server/validation.ts',{'"../gallery-policy"':JSON.stringify(gallery)});
const docsUrl=await moduleUrl('../lib/server/commerce-documents.ts',{'"./validation"':JSON.stringify(validation)});
const {buildDocument,buildPayment,buildReceipt}=await import(docsUrl);
const site=await moduleUrl('../lib/site.ts');
const templates=await import(await moduleUrl('../lib/server/mail-templates.ts',{'"./commerce-documents"':JSON.stringify(docsUrl),'"../site"':JSON.stringify(site)}));
const mail=await import(await moduleUrl('../lib/server/mail-transport.ts'));
const customer={id:'example-inquiry',reference:'DMS-EXAMPLE',createdAt:'2026-11-18T12:00:00Z',name:'Alex <script>alert(1)</script>',email:'alex@example.test',phone:'',addressLine1:'123 Example Street',addressLine2:'',city:'Example City',state:'IN',postcode:'46204',country:'United States',message:'',paymentPreference:'assisted',items:[{productId:'scooter',name:'Travel <Scooter>',image:'/images/example.webp',quantity:2,unitPrice:699.99}],subtotal:1399.98,currency:'USD',status:'new'};
const input={kind:'invoice',items:[{productId:'scooter',quantity:2,unitPrice:699.99}],shipping:20,tax:50,discount:10};
const settings={email:'info@example.test',phone:'',shippingNote:'Delivery confirmed in quote.',returnsNote:'Returns confirmed before purchase.'};
test('documents use integer-cent totals, inquiry-bound items and validated address',()=>{
 const invoice=buildDocument(input,customer,[]);assert.equal(invoice.total,1459.98);assert.equal(invoice.items[0].name,'Travel <Scooter>');
 for(const patch of [{items:[{productId:'foreign',quantity:1,unitPrice:1}]},{tax:0.001},{discount:999999},{deliveryAddress:{}},{kind:'receipt'}])assert.throws(()=>buildDocument({...input,...patch},customer,[]));
});
test('receipts require explicitly verified payments and show remaining balances',()=>{
 const invoice=buildDocument(input,customer,[]);const p={invoiceId:invoice.id,amount:100,method:'Bank transfer',reference:'BANK-123',receivedAt:'2026-11-18T12:00:00Z',confirmReceived:true};
 assert.throws(()=>buildPayment({...p,confirmReceived:false},invoice));
 const payment=buildPayment(p,invoice);const receipt=buildReceipt(invoice,payment,[payment]);assert.equal(receipt.kind,'receipt');assert.equal(receipt.amountPaid,100);assert.equal(receipt.balance,1359.98);assert.throws(()=>buildReceipt(invoice,payment,[]));
});
test('branded HTML escapes customer content and keeps unpaid acknowledgements truthful',()=>{
 const ack=templates.renderAcknowledgement(customer,settings);assert.ok(ack.html.includes('&lt;script&gt;'));assert.ok(!ack.html.includes('<script>'));assert.ok(ack.html.includes('https://discountmobilityscooter.com/images/example.webp'));assert.match(ack.text,/not a paid order/);
 const custom=templates.renderCustomerMessage(customer,settings,'Hello','<img src=x onerror=alert(1)>');assert.ok(!custom.html.includes('<img src=x'));assert.ok(custom.html.includes('&lt;img'));
 assert.equal(templates.imageUrl('javascript:alert(1)'), '');
});
test('email transport rejects header injection and distinguishes uncertain acceptance',async()=>{
 const values={MAIL_FROM:'info@example.test',DMS_MAILER:{configured:true,send:async()=>({id:'accepted-id'})}};
 assert.deepEqual(await mail.sendTransactionalMail(values,'alex@example.test',{subject:'Your quote',html:'<p>Hello</p>',text:'Hello'},'dms/example'),{id:'accepted-id'});
 await assert.rejects(()=>mail.sendTransactionalMail(values,'alex@example.test',{subject:'Bad\r\nBcc: victim@example.test',html:'',text:''},'dms/example'));
 await assert.rejects(()=>mail.sendTransactionalMail({...values,DMS_MAILER:{configured:true,send:async()=>{throw new Error('timeout');}}},'alex@example.test',{subject:'Your quote',html:'',text:''},'dms/example'),e=>e.uncertain===true);
});
test('database prevents overpayments and duplicate sends while preserving saved records',async()=>{
 const db=new NodeDatabase(':memory:');for(const path of ['../drizzle/0000_bored_proudstar.sql','../drizzle/0001_fine_arclight.sql'])db.connection.exec(await fs.readFile(new URL(path,import.meta.url),'utf8'));
 const stub=`data:text/javascript;base64,${Buffer.from('export const database=()=>globalThis.__commerceTestDB').toString('base64')}`;
 globalThis.__commerceTestDB=db;
 const store=await import(await moduleUrl('../lib/server/commerce-store.ts',{'"./store"':JSON.stringify(stub),'"./validation"':JSON.stringify(validation)}));
 try{const invoice=buildDocument(input,customer,[]);await store.saveDocument(invoice);const p=buildPayment({amount:1000,method:'Bank transfer',reference:'BANK-1',receivedAt:'2026-11-18T12:00:00Z',confirmReceived:true},invoice);await store.savePayment(p);assert.equal((await store.savePayment(p)).id,p.id);await assert.rejects(()=>store.savePayment(buildPayment({amount:500,method:'Bank transfer',reference:'BANK-2',receivedAt:'2026-11-18T12:00:00Z',confirmReceived:true},invoice)));assert.equal((await store.readDocument(invoice.id)).balance,459.98);
 const receipt={...buildReceipt(invoice,p,[p]),id:`receipt-${p.id}`};await Promise.all([store.saveDocument(receipt),store.saveDocument(receipt)]);assert.equal((await store.readDocuments(customer.id)).filter(d=>d.kind==='receipt').length,1);
 const email={id:'ack:example',inquiryId:customer.id,documentId:null,kind:'acknowledgement',to:customer.email,subject:'Your request',preview:{subject:'Your request',html:'Hello',text:'Hello'},createdAt:new Date().toISOString()};await store.ensureEmail(email,true);await store.ensureEmail(email,true);assert.equal((await store.readEmailLogs(customer.id)).length,1);await assert.rejects(()=>store.ensureEmail({...email,subject:'Changed'},true));
 }finally{db.close();delete globalThis.__commerceTestDB;}
});
