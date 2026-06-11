import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { Alert, AppState, Platform, ToastAndroid } from 'react-native';
import {
  flushPendingOverlayEvents,
  getOverlayMissionEmitter,
  hideMissionOverlay,
  OVERLAY_MISSION_EVENTS,
  showMissionOverlay,
  type OverlayMissionActionEvent,
} from '../native/OverlayMission';
import { executeMissionAction } from '../missions/missionCompletion';
import {
  clearStaleNotificationMissionLaunch,
  tryOpenPendingNotificationMission,
} from '../missions/missionNotificationLaunch';
import { promptOverlayPermissionIfNeeded } from '../native/overlayPermission';
import { navigateToMissionScreen } from '../navigation/navigationRef';
import { forceEndMissionCaptureSession } from '../utils/missionCaptureSession';
import { ApiHttpError } from '../services/apiClient';
import { scError, scLog } from '../utils/screenCaptureLogger';

function isMissionAlreadyFinishedError(err: unknown): boolean {
  if (err instanceof ApiHttpError && err.status === 409) {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /already completed|awaiting approval/i.test(message);
}

function isQuizNotPassedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /quiz not passed/i.test(message);
}

function isAbandonNotAllowedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /only active pending missions can be abandoned/i.test(message);
}

/** Cooldown re-surface keeps status completed/failed — overlay is enforcement-only. */
function isEnforcementResurface(metadata: Record<string, unknown>): boolean {
  return Number(metadata.resurfaceCount ?? 0) > 0;
}

async function dismissEnforcementOverlay(
  missionId: string,
  message: string,
): Promise<void> {
  await blockResurfacedMission(missionId);
  clearStaleNotificationMissionLaunch();
  await hideMissionOverlay();
  forceEndMissionCaptureSession();
  showBriefMessage(message);
}

function quizRetryMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const { submittedAnswers: _s, answers: _a, ...rest } = metadata;
  return rest;
}

const RESURFACED_BLOCK_PREFIX = 'resurfaced_block_';
const RESURFACED_BLOCK_MS = 2 * 60 * 1000;

async function blockResurfacedMission(missionId: string): Promise<void> {
  const blockUntil = Date.now() + RESURFACED_BLOCK_MS;
  await AsyncStorage.setItem(`${RESURFACED_BLOCK_PREFIX}${missionId}`, String(blockUntil));
}

function showBriefMessage(message: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.LONG);
  } else {
    Alert.alert('Mission', message);
  }
}

async function handleOverlayAction(event: OverlayMissionActionEvent): Promise<void> {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(event.metadataJson || '{}') as Record<string, unknown>;
  } catch {
    metadata = {};
  }

  scLog('Overlay mission action', event);

  if (event.action === 'start') {
    clearStaleNotificationMissionLaunch();
    await hideMissionOverlay();
    navigateToMissionScreen({
      missionId: event.missionId,
      title: String(metadata.overlayTitle ?? 'Mission'),
      description: String(metadata.overlayDescription ?? ''),
      points: Number(metadata.overlayPoints ?? 0),
      missionType: event.missionType,
      metadata,
    });
    return;
  }

  if (event.action === 'abandon' && isEnforcementResurface(metadata)) {
    scLog('Enforcement overlay dismissed — mission already finished', {
      missionId: event.missionId,
      resurfaceCount: metadata.resurfaceCount,
    });
    await dismissEnforcementOverlay(
      event.missionId,
      'Overlay dismissed for 2 minutes — stay on safe content.',
    );
    return;
  }

  try {
    const result = await executeMissionAction(
      event.missionId,
      event.missionType,
      metadata,
      event.action,
    );
    clearStaleNotificationMissionLaunch();
    await hideMissionOverlay();
    forceEndMissionCaptureSession();
    showBriefMessage(result.message);
  } catch (err) {
    if (event.action === 'complete' && isMissionAlreadyFinishedError(err)) {
      scLog('Mission already finished — dismissing enforcement overlay');
      clearStaleNotificationMissionLaunch();
      await hideMissionOverlay();
      forceEndMissionCaptureSession();
      showBriefMessage('Stay on safe content — mission already completed.');
      return;
    }

    if (event.action === 'abandon' && isAbandonNotAllowedError(err)) {
      scLog('Abandon skipped — enforcement overlay only', { missionId: event.missionId });
      await dismissEnforcementOverlay(
        event.missionId,
        'Overlay dismissed for 2 minutes — stay on safe content.',
      );
      return;
    }

    if (
      event.action === 'complete' &&
      event.missionType === 'quiz' &&
      isQuizNotPassedError(err)
    ) {
      scLog('Quiz not passed — re-showing overlay for retry');
      showBriefMessage('Need at least 2 of 3 correct. Try again!');
      try {
        await showMissionOverlay({
          missionId: event.missionId,
          title: String(metadata.overlayTitle ?? 'Mission'),
          description: String(metadata.overlayDescription ?? ''),
          points: Number(metadata.overlayPoints ?? 0),
          missionType: event.missionType,
          metadata: quizRetryMetadata(metadata),
        });
      } catch (retryErr) {
        scError('Quiz overlay retry failed', retryErr);
        await hideMissionOverlay();
        forceEndMissionCaptureSession();
      }
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    scWarn('Overlay mission action failed', { action: event.action, message });
    clearStaleNotificationMissionLaunch();
    await hideMissionOverlay();
    forceEndMissionCaptureSession();
    showBriefMessage(`Mission failed: ${message}`);
  }
}

/**
 * Listens for native overlay button events and notification tap launches.
 */
export function useMissionOverlayListener(): void {
  const handlingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    void promptOverlayPermissionIfNeeded();

    const openPending = () => {
      void tryOpenPendingNotificationMission();
    };

    openPending();

    const emitter = getOverlayMissionEmitter();
    const actionSub = emitter?.addListener(
      OVERLAY_MISSION_EVENTS.MISSION_ACTION,
      (event: OverlayMissionActionEvent) => {
        if (handlingRef.current) {
          return;
        }
        handlingRef.current = true;
        void handleOverlayAction(event).finally(() => {
          handlingRef.current = false;
        });
      },
    );

    const notificationSub = emitter?.addListener(
      OVERLAY_MISSION_EVENTS.PENDING_NOTIFICATION,
      () => {
        openPending();
      },
    );

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void flushPendingOverlayEvents();
        openPending();
      }
    });

    return () => {
      actionSub?.remove();
      notificationSub?.remove();
      appStateSub.remove();
    };
  }, []);
}
