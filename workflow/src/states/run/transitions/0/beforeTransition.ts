import {
  buildChange,
  Context,
  newUuid,
  Operation,
  TypedChanges,
} from '@traent/workflow-lib';
import * as HME from 'h264-mp4-encoder';
import { getCertificateTemplate } from 'libs/certificate-template';
import {
  forceExecutionStreamId,
  logStreamId,
} from 'libs/globals';
import { Gameplay } from 'libs/wasmdoom/gameplay';
import { encode } from 'libs/wasmdoom/handle-frame';
import { inputs } from 'libs/wasmdoom/inputs';
import {
  exitRuntime,
  setAbort,
  setEndGameHandler,
  setExitStatus,
  setFrameHandler,
  setInputEvents,
  setLogHandler,
} from 'libs/wasmdoom/websockets-doom';
import { PDFDocument } from 'pdf-lib';

function quit() {
  exitRuntime();
  setAbort(true);
  setExitStatus(0);
}

const logs = [];
const logHandler = (l) => {
  logs.push(l);
};
setLogHandler(logHandler);

async (context: Context) => {
  const projectId = context.changes.filter((c) => c.type === 'ProjectV0')[0]?.id
    ?? context.objects.getAll('ProjectV0')[0].id;

  // play the game

  let inputGameplay: Gameplay = {
    playerName: 'Anonymous',
    events: [],
    stats: [],
  };

  const forceExecution = context.objects.retrieve<'StreamEntryV0'>(forceExecutionStreamId).data.value;

  if (forceExecution) {
    inputGameplay.events = inputs.events;
    inputGameplay.digest = inputs.digest;
  } else {
    const gameplayStream = new TypedChanges(context.changes)
      .ofType('StreamEntryV0').find((c) => {
        if (c.operation !== Operation.Add) {
          return false;
        }

        try {
          const value = JSON.parse(c.properties.value);
          return 'type' in value && value['type'] === 'gameplay';
        } catch {
          return false;
        }
      });

    inputGameplay = JSON.parse(gameplayStream.properties.value) as Gameplay;
  }

  // make gameplay video

  let gameplay: Gameplay;

  let screenshot: Uint8Array;

  const encoder = await HME.createH264MP4Encoder();
  encoder.width = 320;
  encoder.height = 240;
  encoder.frameRate = 30;
  encoder.speed = 6;
  encoder.initialize();
  const screenshotTick = inputGameplay.events[inputGameplay.events.length - 1].timeStamp / 2;
  const running$ = new Promise<void>((resolve) => {
    setFrameHandler((frame, tick) => {
      encoder.addFrameRgba(frame.data);
      if (!screenshot && tick >= screenshotTick) {
        screenshot = encode(frame);
      }
    });
    setEndGameHandler((g) => {
      gameplay = g;
      quit();
      resolve();
    });
  });

  setInputEvents(inputGameplay.events);

  await running$;

  encoder.finalize();
  const buffer = encoder.FS.readFile(encoder.outputFilename);
  encoder.delete();

  const finalStats = gameplay.stats[gameplay.stats.length - 1];

  const videoContent = context.blobHandler.buildHandle(buffer);

  const videoId = newUuid(`video-${inputGameplay.playerName}-${gameplay.digest}-${finalStats.timestamp}`);
  const videoChange = buildChange(
    videoId,
    'DocumentV0',
    'Add',
    {
      name: `${inputGameplay.playerName} gameplay (${gameplay.digest})`,
      projectId,
      contentId: newUuid(videoId),
      contentType: 'video/mp4',
      length: buffer.length,
      offChainedBlockHashes: videoContent,
      version: 1,
    },
  );

  const digestMatch = inputGameplay.digest === gameplay.digest;

  // make certificate

  const certificateTemplateBytes = getCertificateTemplate();
  const pdfDoc = await PDFDocument.load(certificateTemplateBytes);

  const nameField = pdfDoc.getForm().getTextField('name');
  nameField.setFontSize(16);
  nameField.setText(inputGameplay.playerName);

  const statusField = pdfDoc.getForm().getTextField('status');
  statusField.setFontSize(16);
  statusField.setText(digestMatch
    ? 'Correctly verified!'
    : 'You are a liar!',
  );

  const timeField = pdfDoc.getForm().getTextField('time');
  timeField.setFontSize(16);
  timeField.setText(`${finalStats.timestamp / 1000} seconds`);

  const healthField = pdfDoc.getForm().getTextField('health');
  healthField.setFontSize(16);
  healthField.setText(`${finalStats.health}`);

  const armorField = pdfDoc.getForm().getTextField('armor');
  armorField.setFontSize(16);
  armorField.setText(`${finalStats.armor}`);

  const digestField = pdfDoc.getForm().getTextField('gameplay_hash');
  digestField.setFontSize(16);
  digestField.setText(digestMatch
    ? `${gameplay.digest}`
    : `${gameplay.digest} - Proof of fraud: ${inputGameplay.digest}`,
  );

  const pictureField = pdfDoc.getForm().getTextField('inspection_photo');
  const pdfPicture = await pdfDoc.embedPng(screenshot);
  pictureField.setImage(pdfPicture);

  pdfDoc.getForm().flatten();

  const documentBytes = await pdfDoc.save();

  const certificateContent = context.blobHandler.buildHandle(documentBytes);

  const certificateId = newUuid(`certificate-${inputGameplay.playerName}-${gameplay.digest}-${finalStats.timestamp}`);
  const certificateChange = buildChange(
    certificateId,
    'DocumentV0',
    'Add',
    {
      name: `${inputGameplay.playerName} certificate (${gameplay.digest})`,
      projectId,
      contentId: newUuid(certificateId),
      contentType: 'application/pdf',
      length: buffer.length,
      offChainedBlockHashes: certificateContent,
      version: 1,
    },
  );

  // cleanup

  const logChange = buildChange(
    logStreamId,
    'StreamEntryV0',
    'Update',
    {
      value: logs.join('; '),
    },
  );

  const disableForceExecutionChange = buildChange(
    forceExecutionStreamId,
    'StreamEntryV0',
    'Update',
    {
      value: false,
    },
  );

  return [
    videoChange,
    certificateChange,
    logChange,
    disableForceExecutionChange,
  ];
};
