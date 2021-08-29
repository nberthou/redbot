"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MusicSubscription = void 0;
const voice_1 = require("@discordjs/voice");
const util_1 = require("util");
const wait = util_1.promisify(setTimeout);
class MusicSubscription {
    constructor(voiceConnection) {
        this.queueLock = false;
        this.readyLock = false;
        this.voiceConnection = voiceConnection;
        this.audioPlayer = voice_1.createAudioPlayer();
        this.queue = [];
        this.voiceConnection.on('stateChange', async (_, newState) => {
            if (newState.status === voice_1.VoiceConnectionStatus.Disconnected) {
                if (newState.reason === voice_1.VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
                    try {
                        await voice_1.entersState(this.voiceConnection, voice_1.VoiceConnectionStatus.Connecting, 5000);
                    }
                    catch {
                        this.voiceConnection.destroy();
                    }
                }
                else if (this.voiceConnection.rejoinAttempts < 5) {
                    await wait((this.voiceConnection.rejoinAttempts + 1) * 5000);
                    this.voiceConnection.rejoin();
                }
                else {
                    this.voiceConnection.destroy();
                }
            }
            else if (newState.status === voice_1.VoiceConnectionStatus.Destroyed) {
                this.stop();
            }
            else if (!this.readyLock && (newState.status === voice_1.VoiceConnectionStatus.Connecting || newState.status === voice_1.VoiceConnectionStatus.Signalling)) {
                this.readyLock = true;
                try {
                    await voice_1.entersState(this.voiceConnection, voice_1.VoiceConnectionStatus.Ready, 20000);
                }
                catch {
                    if (this.voiceConnection.state.status !== voice_1.VoiceConnectionStatus.Destroyed)
                        this.voiceConnection.destroy();
                }
                finally {
                    this.readyLock = false;
                }
            }
        });
        this.audioPlayer.on('stateChange', (oldState, newState) => {
            if (newState.status === voice_1.AudioPlayerStatus.Idle && oldState.status !== voice_1.AudioPlayerStatus.Idle) {
                oldState.resource.metadata.onFinish();
                void this.processQueue();
            }
            else if (newState.status === voice_1.AudioPlayerStatus.Playing) {
                newState.resource.metadata.onStart();
            }
        });
        this.audioPlayer.on('error', error => error.resource.metadata.onError(error));
        voiceConnection.subscribe(this.audioPlayer);
    }
    /**
     * Adds a new Track to the queue.
     *
     * @param track The Track to add to the queue
    */
    enqueue(track) {
        this.queue.push(track);
        void this.processQueue();
    }
    stop() {
        this.queueLock = true;
        this.queue = [];
        this.audioPlayer.stop(true);
    }
    async processQueue() {
        if (this.queueLock || this.audioPlayer.state.status !== voice_1.AudioPlayerStatus.Idle || this.queue.length === 0) {
            return;
        }
        this.queueLock = true;
        const nextTrack = this.queue.shift();
        try {
            const resource = await nextTrack.createAudioResource();
            this.audioPlayer.play(resource);
            this.queueLock = false;
        }
        catch (error) {
            nextTrack.onError(error);
            this.queueLock = false;
            return this.processQueue();
        }
    }
}
exports.MusicSubscription = MusicSubscription;
//# sourceMappingURL=subscription.js.map