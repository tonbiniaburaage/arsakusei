export class CameraController {
  constructor(video) {
    this.video = video;
    this.stream = null;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('このブラウザではカメラを利用できません。');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  stop() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
