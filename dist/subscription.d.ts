import { AudioPlayer, VoiceConnection } from '@discordjs/voice';
import { Track } from './track';
export declare class MusicSubscription {
    readonly voiceConnection: VoiceConnection;
    readonly audioPlayer: AudioPlayer;
    queue: Track[];
    queueLock: boolean;
    readyLock: boolean;
    constructor(voiceConnection: VoiceConnection);
    /**
     * Adds a new Track to the queue.
     *
     * @param track The Track to add to the queue
    */
    enqueue(track: Track): void;
    stop(): void;
    private processQueue;
}
//# sourceMappingURL=subscription.d.ts.map