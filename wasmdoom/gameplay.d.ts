export type Event = {
  location: number,
  ctrlKey: boolean,
  shiftKey: boolean,
  altKey: boolean,
  metaKey: boolean,
  repeat: boolean,
  charCode: number,
  keyCode: number,
  which: number,
  key: string,
  code: string,
  type: string,
  timeStamp: number,
}

export type Stats = {
  timestamp: number,
  health: number,
  armor: number,
  episode: number,
  mission: number,
  skill: number,
}

export type Gameplay = {
  playerName?: string,
  events: Event[],
  stats: Stats[],
  digest?: number | string,
}
