import {createServiceToken,type ServiceResolver} from '@nocobase/service-provider';
interface DeliveryPort {risk(id:string):Promise<{lowRisk:boolean;amount:number}>;applyDecision(id:string,decision:{decision:string;actorId:string;version?:number},key:string):Promise<{applied:boolean}>;}
// Stable application service token, resolved through the native run service boundary.
const delivery=createServiceToken<DeliveryPort>('app/showcase');
interface Context {input:{deliveryId:string};parameters:Record<string,never>;nodeResults:{check?:{lowRisk:boolean;amount:number};decision?:{decision:string;actorId:string;version:number}};}
interface Options {services:Pick<ServiceResolver,'resolve'>;idempotencyKey?:string;}
export async function run(context:Context,options:Options){return options.services.resolve(delivery).risk(context.input.deliveryId);}
export async function lowRisk(context:Context){return context.nodeResults.check?.lowRisk===true;}
export async function automatic(context:Context,options:Options){return options.services.resolve(delivery).applyDecision(context.input.deliveryId,{decision:'approve',actorId:'policy'},options.idempotencyKey!);}
export async function apply(context:Context,options:Options){if(!context.nodeResults.decision)throw new Error('Decision missing');return options.services.resolve(delivery).applyDecision(context.input.deliveryId,context.nodeResults.decision,options.idempotencyKey!);}
