//
//  Created by Mingliang Chen on 18/3/9.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Logger = require('./node_core_logger');

const EventEmitter = require('events');
const { spawn } = require('child_process');
const dateFormat = require('dateformat');
const mkdirp = require('mkdirp');
const fs = require('fs');
const context = require("./node_core_ctx");

const clean = (obj) => {
  let newObj = {};

  for (const propName in obj) {
    if (obj[propName] !== null && obj[propName] !== undefined) {
      newObj[propName] = obj[propName];
    }
  }

  return newObj;
};

const stringify = (obj) => {
  return Object.keys(obj).map((k) => `${k}: ${obj[k]}`).join(',');
};

class NodeTransSession extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf;
    this.mp4Filename = null;
    this.flvFilename = null;
    this.mkvFilename = null;
  }

  isRecording() {
    return this.mp4Filename || this.flvFilename || this.mkvFilename;
  }

  run() {
    let vc = this.conf.vc || 'copy';
    let ac = this.conf.ac || 'copy';
    let inPath = 'rtmp://127.0.0.1:' + this.conf.rtmpPort + this.conf.streamPath;
    let ouPath = `${this.conf.mediaroot}/${this.conf.streamApp}/${this.conf.streamName}`;
    let mapStr = '';

    if (this.conf.rtmp && this.conf.rtmpApp) {
      if (this.conf.rtmpApp === this.conf.streamApp) {
        Logger.error('[Transmuxing RTMP] Cannot output to the same app.');
      } else {
        let rtmpOutput = `rtmp://127.0.0.1:${this.conf.rtmpPort}/${this.conf.rtmpApp}/${this.conf.streamName}`;
        mapStr += `[f=flv]${rtmpOutput}|`;
        Logger.log('[Transmuxing RTMP] ' + this.conf.streamPath + ' to ' + rtmpOutput);
      }
    }
    if (this.conf.mp4) {
      this.conf.mp4Flags = this.conf.mp4Flags ? this.conf.mp4Flags : '';
      let mp4FileName = dateFormat('yyyy-mm-dd-HH-MM') + '.mp4';
      let mapMp4 = this.mp4Filename = `${this.conf.mp4Flags}${ouPath}/${mp4FileName}|`;
      mapStr += mapMp4;
      // Logger.log('[Transmuxing MP4] ' + this.conf.streamPath + ' to ' + ouPath + '/' + mp4FileName);
    }
    if (this.conf.flv) {
      this.conf.flvFlags = this.conf.flvFlags ? this.conf.flvFlags : '';
      let flvFileName = dateFormat('yyyy-mm-dd-HH-MM') + '.flv';
      let mapFlv = this.flvFilename = `${this.conf.flvFlags}${ouPath}/${flvFileName}|`;
      mapStr += mapFlv;
    }
    if (this.conf.mkv) {
      this.conf.mkvFlags = this.conf.mkvFlags ? this.conf.mkvFlags : '';
      let mkvFileName = dateFormat('yyyy-mm-dd-HH-MM') + '.mkv';
      let mapMkv = this.mkvFilename = `${this.conf.mkvFlags}${ouPath}/${mkvFileName}|`;
      mapStr += mapMkv;
    }
    if (this.conf.hls) {
      this.conf.hlsFlags = this.conf.hlsFlags ? this.conf.hlsFlags : '';
      let hlsFileName = 'index.m3u8';
      let mapHls = `${this.conf.hlsFlags}${ouPath}/${hlsFileName}|`;
      mapStr += mapHls;
      Logger.log('[Transmuxing HLS] ' + this.conf.streamPath + ' to ' + ouPath + '/' + hlsFileName);
    }
    if (this.conf.dash) {
      this.conf.dashFlags = this.conf.dashFlags ? this.conf.dashFlags : '';
      let dashFileName = 'index.mpd';
      let mapDash = `${this.conf.dashFlags}${ouPath}/${dashFileName}`;
      mapStr += mapDash;
      Logger.log('[Transmuxing DASH] ' + this.conf.streamPath + ' to ' + ouPath + '/' + dashFileName);
    }
    const recordingFiles = clean({
      mp4: this.mp4Filename && this.mp4Filename.slice(0, -1),
      mkv: this.mkvFilename && this.mkvFilename.slice(0, -1),
      flv: this.flvFilename && this.flvFilename.slice(0, -1),
    });
    mkdirp.sync(ouPath);
    let argv = ['-y', '-fflags', 'nobuffer', '-i', inPath];
    Array.prototype.push.apply(argv, ['-c:v', vc]);
    Array.prototype.push.apply(argv, this.conf.vcParam);
    Array.prototype.push.apply(argv, ['-c:a', ac]);
    Array.prototype.push.apply(argv, this.conf.acParam);
    Array.prototype.push.apply(argv, ['-f', 'tee', '-map', '0:a?', '-map', '0:v?', mapStr]);
    argv = argv.filter((n) => { return n }); //去空
    this.ffmpeg_exec = spawn(this.conf.ffmpeg, argv);
    this.ffmpeg_exec.on('error', (e) => {
      Logger.ffdebug(e);
    });

    if (this.isRecording()) {
      context.nodeEvent.emit("preRecord", this.conf.streamPath, recordingFiles);
      Logger.log('[Start Recording] filename(s): ' + stringify(recordingFiles));
    }

    this.ffmpeg_exec.stdout.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
    });

    this.ffmpeg_exec.stderr.on('data', (data) => {
      Logger.ffdebug(`FF输出：${data}`);
    });

    this.ffmpeg_exec.on('close', (code) => {
      Logger.log('[Transmuxing end] ' + this.conf.streamPath);
      this.emit('end');

      if (this.isRecording()) {
        context.nodeEvent.emit("doneRecord", this.conf.streamPath, recordingFiles);
        Logger.log('[End Recording] filename(s): ' + stringify(recordingFiles));
      }

      fs.readdir(ouPath, function (err, files) {
        if (!err) {
          files.forEach((filename) => {
            if (filename.endsWith('.ts')
              || filename.endsWith('.m3u8')
              || filename.endsWith('.mpd')
              || filename.endsWith('.m4s')
              || filename.endsWith('.tmp')) {
              fs.unlinkSync(ouPath + '/' + filename);
            }
          })
        }
      });
    });
  }

  end() {
    // this.ffmpeg_exec.kill();
  }
}

module.exports = NodeTransSession;