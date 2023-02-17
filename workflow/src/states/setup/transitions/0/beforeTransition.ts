import {
  buildChange,
  buildSwitchToChange,
  Context,
} from '@traent/workflow-lib';
import {
  logStreamId,
  forceExecutionStreamId,
} from 'libs/globals';

const FORCE_EXECUTION = true;

async (context: Context) => {
  const projectId = context.changes.filter((c) => c.type === 'ProjectV0')[0]?.id
    ?? context.objects.getAll('ProjectV0')[0].id;

  const forceExecutionChange = buildChange(
    forceExecutionStreamId,
    'StreamEntryV0',
    'Add',
    {
      isHidden: true,
      name: 'ForceExecution',
      projectId,
      type: 'boolean',
      value: FORCE_EXECUTION,
    },
  );

  const logChange = buildChange(
    logStreamId,
    'StreamEntryV0',
    'Add',
    {
      name: 'Last Log',
      isHidden: true,
      projectId,
      type: 'text',
    },
  );

  return [
    buildSwitchToChange(context, 'run'),
    logChange,
    forceExecutionChange,
  ];
};
