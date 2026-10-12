import CoreProvider from '../srm-core/provider.js';
import BridgeProvider from '../integration/provider.js';
import ShowcaseProvider from './showcase/index.js';
import OperationsProvider from './operations/index.js';
import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  BridgeProvider,
  OperationsProvider,
  CoreProvider,
  ShowcaseProvider,
];

export default serviceProviders;
