#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ReportSampleStack } from '../lib/report-sample-stack'
import { getAppParameter } from './parameter';

const app = new cdk.App();
const argContext = 'environment';
const envKey = app.node.tryGetContext(argContext);
const appParameter = getAppParameter(envKey);

new ReportSampleStack(app, `${appParameter.envName}-${appParameter.projectName}-report-sample`, {
  env: appParameter.env,
  envName: appParameter.envName,
  projectName: appParameter.projectName,
  ragKnowledgeBaseId: '',
});
