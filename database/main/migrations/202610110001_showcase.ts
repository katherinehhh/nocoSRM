import {defineMigration} from '@nocobase/db';
export default defineMigration({name:'202610110001_showcase',async up({builder}){
 await builder.createCollection('showcaseDeliveries',c=>{
 c.string('id',{length:64}).notNull();c.primary('id');
 for(const f of ['number','name','organizationId','supplierId','orderId','region','businessDate','notes','createdBy','updatedAt']) c.text(f).notNull();
 c.unique('number');c.text('lines').notNull();c.integer('labelCount').notNull();c.integer('amount').notNull();c.string('status',{length:32}).notNull();c.datetimeTz('statusChangedAt').notNull();c.integer('lifecycleVersion').notNull().defaultTo(0);
 for(const f of ['submittedBy','decisionBy','workflowRunId','resumeRequestId'])c.text(f).nullable();c.boolean('autoApprove').notNull().defaultTo(false);c.index(['status','statusChangedAt']);c.index(['organizationId','supplierId']);
 });
 await builder.createCollection('lifecycleTransitions',c=>{
 for(const f of ['id','lifecycle','recordId','transition','to','actorId','requestKey'])c.text(f).notNull();c.primary('id');c.text('from').nullable();c.text('requestId').nullable();c.json('input').notNull();c.datetimeTz('at').notNull();c.integer('version').notNull();c.unique(['lifecycle','recordId','version']);c.unique(['lifecycle','recordId','requestKey']);c.index(['lifecycle','recordId','id']);
 });
 await builder.createCollection('lifecycleEffectRuns',c=>{
 for(const f of ['id','transitionId','lifecycle','recordId','effect','status'])c.text(f).notNull();c.primary('id');c.boolean('stayBound').notNull();c.integer('attempts').notNull().defaultTo(0);c.integer('maxAttempts').notNull().defaultTo(1);c.json('result').nullable();c.text('error').nullable();
 for(const f of ['createdAt','updatedAt'])c.datetimeTz(f).notNull();for(const f of ['claimedAt','runAfter','continuationDueAt','continuationAbandonedAt'])c.datetimeTz(f).nullable();c.json('continuation').nullable();c.index(['status','id']);c.index(['lifecycle','recordId','id']);c.index('continuationDueAt');c.index('continuationAbandonedAt');
 });
 for(const table of ['showcaseExternal','showcaseEvents','showcaseResolutions','showcaseTemplates','showcaseKeys','showcaseProposals'])await builder.createCollection(table,c=>{
 c.text('id').notNull();c.primary('id');c.text('organizationId').notNull();c.text('supplierId').nullable();c.text('recordId').nullable();c.text('payload').notNull();c.integer('version').notNull().defaultTo(1);c.text('updatedAt').notNull();c.index(['organizationId','recordId']);
 });
},async down({builder}){for(const t of ['showcaseProposals','showcaseKeys','showcaseTemplates','showcaseResolutions','showcaseEvents','showcaseExternal','lifecycleEffectRuns','lifecycleTransitions','showcaseDeliveries'])await builder.dropCollection(t);}});
