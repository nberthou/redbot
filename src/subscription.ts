import {
	AudioPlayer,
	AudioPlayerStatus,
	AudioResource,
	createAudioPlayer,
	entersState,
	VoiceConnection,
	VoiceConnectionDisconnectReason,
	VoiceConnectionStatus,
} from '@discordjs/voice';
import { Track } from './track';
import { promisify } from 'util';

const wait = promisify(setTimeout);

export class MusicSubscription {
	public readonly voiceConnection: VoiceConnection;
	public readonly audioPlayer: AudioPlayer;
	public queue: Track[];
	public queueLock = false;
	public readyLock = false;

	public constructor(voiceConnection: VoiceConnection) {
		this.voiceConnection = voiceConnection;
		this.audioPlayer = createAudioPlayer();
		this.queue = [];

		this.voiceConnection.on('stateChange', async (_, newState) => {
			if (newState.status === VoiceConnectionStatus.Disconnected) {
				if (newState.reason === VoiceConnectionDisconnectReason.WebSocketClose && newState.closeCode === 4014) {
					try {
						await entersState(this.voiceConnection, VoiceConnectionStatus.Connecting, 5_000);
					} catch {
						this.voiceConnection.destroy();
					}
				} else if (this.voiceConnection.rejoinAttempts < 5) {
					await wait((this.voiceConnection.rejoinAttempts + 1) * 5_000);
					this.voiceConnection.rejoin();
				} else {
					this.voiceConnection.destroy();
				}
			} else if (newState.status === VoiceConnectionStatus.Destroyed) {
				this.stop();
			} else if (!this.readyLock && (newState.status === VoiceConnectionStatus.Connecting || newState.status === VoiceConnectionStatus.Signalling)) {
				this.readyLock = true;
				try {
					await entersState(this.voiceConnection, VoiceConnectionStatus.Ready, 20_000);
				} catch {
					if (this.voiceConnection.state.status !== VoiceConnectionStatus.Destroyed) this.voiceConnection.destroy();
				} finally {
					this.readyLock = false;
				}
			}
		});

		this.audioPlayer.on('stateChange', (oldState, newState) => {
			if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
				console.log('(oldState.resource as AudioResource<Track>)', (oldState.resource as AudioResource<Track>).metadata.title);
				(oldState.resource as AudioResource<Track>).metadata.onFinish();
				void this.processQueue();
			} else if (newState.status === AudioPlayerStatus.Playing) {
				console.log('(newState.resource as AudioResource<Track>)', (newState.resource as AudioResource<Track>).metadata.title);
				(newState.resource as AudioResource<Track>).metadata.onStart();
			}
		});

		this.audioPlayer.on('error', error => (error.resource as AudioResource<Track>).metadata.onError(error));
		voiceConnection.subscribe(this.audioPlayer);
	}

	/**
	 * Adds a new Track to the queue.
	 * 
	 * @param track The Track to add to the queue
	*/
	public enqueue(track: Track) {
		this.queue.push(track);
		void this.processQueue();
	}

	public stop() {
		this.queueLock = true;
		this.queue = [];
		this.audioPlayer.stop(true);
	}

	private async processQueue(): Promise<void> {
		if (this.queueLock || this.audioPlayer.state.status !== AudioPlayerStatus.Idle || this.queue.length === 0) {
			return;
		}
		this.queueLock = true;
		const nextTrack = this.queue.shift()!;
		console.log('nextTrack', nextTrack.title, nextTrack.url);
		console.log('queue', this.queue);
		try {
			const resource = await nextTrack.createAudioResource();
			this.audioPlayer.play(resource);
			this.queueLock = false;
		} catch (error) {
			nextTrack.onError(error as Error);
			this.queueLock = false;
			return this.processQueue();
		}
	}

}