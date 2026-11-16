import {withEnv,type WorkerEnv} from './database.ts';
import {features} from './features.ts';
export default {async scheduled(_event:ScheduledEvent,env:WorkerEnv,context:ExecutionContext){context.waitUntil(withEnv(env,()=>features.external.scheduled()));}};
