import {
  Context,
  Operation,
} from '@traent/workflow-lib';
import { forceExecutionStreamId } from 'libs/globals';

(context: Context) => {
  const forceExecution = context.objects.retrieve<'StreamEntryV0'>(forceExecutionStreamId).data.value;
  if (forceExecution) {
    return true;
  }

  return context.changes.some((c) => {
    if (c.operation !== Operation.Add || c.type !== 'StreamEntryV0') {
      return false;
    }

    try {
      const value = JSON.parse(c.properties.value);
      return 'type' in value && value['type'] === 'gameplay';
    } catch {
      return false;
    }
  });
};
