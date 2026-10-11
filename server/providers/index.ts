import ShowcaseProvider from './showcase/index.js';
import OperationsProvider from './operations/index.js';
import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [OperationsProvider, ShowcaseProvider];

export default serviceProviders;
