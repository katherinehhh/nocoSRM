import { defineMigration } from '@nocobase/db';
const tables=['showcaseDeliveries','showcaseExternal','showcaseEvents','showcaseResolutions','showcaseTemplates','showcaseKeys','showcaseProposals'];
export default defineMigration({name:'202610110003_showcase_sort_fields',async up({builder}){for(const table of tables)await builder.alterCollection(table,c=>{c.alterField('updatedAt',{type:'string',length:40});});},async down({builder}){for(const table of tables)await builder.alterCollection(table,c=>{c.alterField('updatedAt',{type:'text'});});}});
