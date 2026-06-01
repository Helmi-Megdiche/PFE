export type RootStackParamList = {
  MainTabs: undefined;
  MissionScreen: {
    missionId: string;
    title: string;
    description: string;
    points: number;
    missionType: string;
    metadata: Record<string, unknown>;
  };
};

export type MainTabParamList = {
  Monitor: undefined;
  Missions: undefined;
  Rewards: undefined;
  Badges: undefined;
  Profile: undefined;
};
