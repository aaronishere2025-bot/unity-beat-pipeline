import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Volume2, VolumeX, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface BeatPlayerProps {
  audioUrl: string;
  title?: string;
  bpm?: number;
  key?: string;
  duration?: number;
  showDownload?: boolean;
  onDownload?: () => void;
  autoPlay?: boolean;
  compact?: boolean;
}

export default function BeatPlayer({
  audioUrl,
  title,
  bpm,
  key: musicalKey,
  duration,
  showDownload = false,
  onDownload,
  autoPlay = false,
  compact = false,
}: BeatPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setTotalDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    if (autoPlay) {
      audio
        .play()
        .then(() => setIsPlaying(true))
        .catch(console.error);
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl, autoPlay]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (values: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = values[0];
      setCurrentTime(values[0]);
    }
  };

  const handleVolumeChange = (values: number[]) => {
    setVolume(values[0]);
    if (values[0] > 0) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <audio ref={audioRef} src={audioUrl} preload="metadata" />
        <Button size="sm" variant="outline" onClick={togglePlay} className="h-8 w-8 p-0">
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <div className="flex-1 min-w-0">
          <Slider value={[currentTime]} max={totalDuration} step={0.1} onValueChange={handleSeek} className="w-full" />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatTime(currentTime)} / {formatTime(totalDuration)}
        </span>
      </div>
    );
  }

  return (
    <Card className="p-4">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Title and metadata */}
      {(title || bpm || musicalKey) && (
        <div className="mb-3">
          {title && <h3 className="font-semibold text-lg mb-1">{title}</h3>}
          {(bpm || musicalKey) && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {bpm && <span>{bpm} BPM</span>}
              {musicalKey && <span>Key: {musicalKey}</span>}
              {duration && <span>{formatTime(duration)}</span>}
            </div>
          )}
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-3">
        <Slider value={[currentTime]} max={totalDuration} step={0.1} onValueChange={handleSeek} className="w-full" />
        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {/* Play/Pause */}
        <Button size="lg" onClick={togglePlay} className="h-12 w-12 rounded-full p-0">
          {isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-1" />}
        </Button>

        {/* Volume */}
        <div className="flex items-center gap-2 flex-1 max-w-[200px]">
          <Button size="sm" variant="ghost" onClick={toggleMute} className="h-8 w-8 p-0">
            {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <Slider value={[volume]} max={1} step={0.01} onValueChange={handleVolumeChange} className="flex-1" />
        </div>

        {/* Download */}
        {showDownload && onDownload && (
          <Button size="sm" variant="outline" onClick={onDownload} className="ml-auto">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        )}
      </div>
    </Card>
  );
}
