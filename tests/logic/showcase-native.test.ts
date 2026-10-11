// @vitest-environment node
import {randomBytes} from 'node:crypto';
import {expect} from 'vitest';
import {createAppTest} from '@nocobase/app-testing/server';
import {DEFAULT_ADMIN_CREDENTIALS, signIn} from '@nocobase/app-plugin-authentication/testing';
import {workflowServiceToken} from '@nocobase/app-plugin-workflow/server';
import {agentsToken} from '@nocobase/app-plugin-agents/server/tokens';
import {createStandaloneServer} from '../../server/standalone.js';
const test=createAppTest({createServer:createStandaloneServer,config:{app:{publicOrigin:'http://localhost'},secrets:{keys:[{version:1,key:randomBytes(32).toString('base64')}]},users:{initialAdmin:{...DEFAULT_ADMIN_CREDENTIALS}}}});
test('public native workflow and agents server contracts coexist with client3',async({testApp,app,request})=>{
 expect((await request('/workflows')).status).toBe(401);
 const admin=await signIn(testApp,DEFAULT_ADMIN_CREDENTIALS);
 const r=await admin.fetch('/workflows');expect(r.status).toBe(200);
 expect(app.container.resolve(workflowServiceToken).getInstructionApi('wait')).toBeDefined();
 const agents=app.container.resolve(agentsToken);expect(await agents.online.gateway.catalog('chat')).toEqual({services:[],defaultModel:null});
 const swagger=await admin.fetch('/swagger');expect(swagger.status).toBe(200);
 const spec=await swagger.json() as {paths:Record<string,unknown>};
 expect(Object.keys(spec.paths).some(p=>p.includes('/agents/'))).toBe(true);
},60000);

test('delivery workflow, ledger versions, signed sync and proposal boundaries',async({testApp,app,request})=>{
 const admin=await signIn(testApp,DEFAULT_ADMIN_CREDENTIALS);
 const headers={'Content-Type':'application/json',Origin:'http://localhost'};
 const post=async(path:string,body:unknown)=>admin.fetch(path,{method:'POST',headers,body:JSON.stringify(body)});
 expect((await request('/showcase/deliveryPlans')).status).toBe(401);
 const demo=await post('/operations/demo',{password:'Showcase-Test-Only-294!'});expect(demo.status).toBe(200);
 const created=await post('/showcase/scenarios',{requestId:'integration-scenario'});expect(await created.clone().text()).not.toContain('INTERNAL_SERVER_ERROR');expect(created.status).toBe(200);
 const rows=(await created.json()) as {data:{id:string;lifecycleVersion:number}[]};expect(rows.data).toHaveLength(2);
 const again=await post('/showcase/scenarios',{requestId:'integration-scenario'});expect((await again.json()).data.map((r:{id:string})=>r.id)).toEqual(rows.data.map(r=>r.id));
 const sync=await post('/showcase/integrations/demo/sync',{requestId:'sync-a'});expect(sync.status).toBe(200);
 const replay=await post('/showcase/integrations/demo/sync',{requestId:'sync-a'});expect((await replay.json()).data.replayed).toBe(true);
 const list=await admin.fetch('/showcase/businessLedger');expect(list.status).toBe(200);const ledger=(await list.json()).data as {id:string;version:string;disposition:string}[];
 expect(ledger.map(r=>r.disposition).sort()).toEqual(['disputed','matched']);
 const resolution=await post(`/showcase/businessLedger/${ledger[0]!.id}/resolve`,{expectedVersion:ledger[0]!.version,reason:'Checked source evidence',requestId:'resolve-a'});expect(resolution.status).toBe(200);
 const stale=await post(`/showcase/businessLedger/${ledger[0]!.id}/resolve`,{expectedVersion:ledger[0]!.version,reason:'Stale evidence',requestId:'resolve-b'});expect(stale.status).toBe(409);
 const unsupported=await post('/showcase/assistant/prepare',{id:rows.data[0]!.id,utterance:'付款并批准所有记录'});expect(unsupported.status).toBe(400);
 const source=await admin.fetch('/workflows');const workflows=(await source.json()).data as {key:string;hash:string|null;id:string|null}[];const workflow=workflows.find(w=>w.key==='delivery-approval');expect(workflow).toBeDefined();
 expect((await post(`/workflows/${workflow!.id??workflow!.hash}/enable`,{})).status).toBe(200);
 const submitted=await post(`/showcase/deliveryPlans/${rows.data[0]!.id}/fire`,{transition:'submit',expectVersion:rows.data[0]!.lifecycleVersion,requestId:'submit-a'});expect(await submitted.clone().text()).not.toContain('INTERNAL_SERVER_ERROR');expect(submitted.status).toBe(200);
 const {showcaseToken}=await import('../../server/providers/showcase/index.js');const service=app.container.resolve(showcaseToken);
 await expect.poll(async()=>{const r=await service.db.repository('showcaseDeliveries').findOne({filter:{id:rows.data[0]!.id}});return r?.workflowRunId;},{timeout:15000}).toBeTruthy();
 const self=await post(`/showcase/deliveryPlans/${rows.data[0]!.id}/fire`,{transition:'approve',expectVersion:rows.data[0]!.lifecycleVersion+1,requestId:'self-a'});expect(self.status).toBe(403);
},60000);
