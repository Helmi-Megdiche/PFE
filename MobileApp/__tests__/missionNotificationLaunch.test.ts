jest.mock('../src/services/missionsApi', () => ({
  getMissionById: jest.fn(),
}));

jest.mock('../src/native/overlayPermission', () => ({
  consumePendingNotificationMission: jest.fn(),
  clearPendingNotificationMission: jest.fn(),
}));

jest.mock('../src/navigation/navigationRef', () => ({
  navigateToMissionScreen: jest.fn(),
}));

import { tryOpenPendingNotificationMission } from '../src/missions/missionNotificationLaunch';
import { consumePendingNotificationMission } from '../src/native/overlayPermission';
import { getMissionById } from '../src/services/missionsApi';
import { navigateToMissionScreen } from '../src/navigation/navigationRef';

const mockConsume = consumePendingNotificationMission as jest.Mock;
const mockGetMission = getMissionById as jest.Mock;
const mockNavigate = navigateToMissionScreen as jest.Mock;

describe('missionNotificationLaunch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens mission when notification payload is still pending', async () => {
    mockConsume.mockResolvedValue({
      missionId: 'm1',
      title: 'Memory Challenge',
      description: 'Play N-back',
      points: 45,
      missionType: 'cognitive',
      metadataJson: '{"type":"cognitive"}',
    });
    mockGetMission.mockResolvedValue({ id: 'm1', status: 'pending' });

    await tryOpenPendingNotificationMission();

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ missionId: 'm1', title: 'Memory Challenge' }),
    );
  });

  it('skips launch when mission is already completed', async () => {
    mockConsume.mockResolvedValue({
      missionId: 'm1',
      title: 'Memory Challenge',
      description: 'Play N-back',
      points: 45,
      missionType: 'cognitive',
      metadataJson: '{}',
    });
    mockGetMission.mockResolvedValue({ id: 'm1', status: 'pending_approval' });

    await tryOpenPendingNotificationMission();

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does nothing when no pending notification mission', async () => {
    mockConsume.mockResolvedValue(null);

    await tryOpenPendingNotificationMission();

    expect(mockGetMission).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
