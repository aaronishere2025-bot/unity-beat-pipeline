#!/usr/bin/env tsx
/**
 * Generate a week's worth of content:
 * - 25 trap videos (2-3 min)
 * - 5 lofi videos (30+ min)
 */

async function generateWeekContent() {
  const apiUrl = 'http://localhost:8080';

  console.log('🎵 Generating content for the week...\n');

  // Trap beat styles and variations
  const trapStyles = [
    { style: 'Dark Trap', bpm: 140, description: 'Hard-hitting 808s, dark synths, aggressive hi-hats' },
    { style: 'Melodic Trap', bpm: 145, description: 'Emotional melodies, smooth 808s, atmospheric pads' },
    { style: 'Rage Trap', bpm: 160, description: 'Distorted 808s, chaotic energy, rage vocals' },
    { style: 'Street Trap', bpm: 135, description: 'Street vibes, classic trap drums, gritty basslines' },
    { style: 'Club Trap', bpm: 150, description: 'Party energy, bouncy 808s, catchy hooks' },
    { style: 'Future Trap', bpm: 142, description: 'Futuristic synths, heavy bass, experimental sounds' },
    { style: 'Drill', bpm: 140, description: 'UK/Chicago drill vibes, sliding 808s, dark piano' },
    { style: 'Plugg Trap', bpm: 138, description: 'Video game sounds, lighthearted melodies, bouncy beats' },
    { style: 'Memphis Trap', bpm: 136, description: 'Memphis samples, phonk vibes, vintage drum breaks' },
  ];

  // Lofi styles
  const lofiStyles = [
    { duration: 30, vibe: 'Study Focus', description: 'Perfect for deep focus, studying, and productivity' },
    { duration: 35, vibe: 'Night Drive', description: 'Late night vibes, city lights, cruising' },
    { duration: 40, vibe: 'Morning Coffee', description: 'Gentle morning energy, coffee shop ambiance' },
    { duration: 32, vibe: 'Rainy Day', description: 'Cozy rainy day vibes, perfect for relaxation' },
    { duration: 45, vibe: 'Sleep & Meditation', description: 'Ultra calm, peaceful, sleep-inducing beats' },
  ];

  // Generate trap videos
  console.log('🔥 Generating 25 trap videos...\n');

  for (let i = 0; i < 25; i++) {
    const style = trapStyles[i % trapStyles.length];
    const duration = 120 + Math.floor(Math.random() * 60); // 2-3 minutes
    const variant = Math.floor(i / trapStyles.length) + 1;

    const title = `${style.style} Type Beat ${variant} - "${generateTrapName()}"`;
    const scriptContent = `${style.description} | ${style.bpm} BPM | Free Type Beat 2026`;

    console.log(
      `  ${i + 1}/25: ${title} (${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')})`,
    );

    try {
      const response = await fetch(`${apiUrl}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'music',
          scriptName: title,
          scriptContent: scriptContent,
          duration: duration,
          aspectRatio: '9:16',
          musicStyle: style.style.toLowerCase().replace(' ', '_'),
          bpm: style.bpm,
          autoUpload: false,
        }),
      });

      const result = await response.json();
      if (result.success) {
        console.log(`     ✅ Job created: ${result.data.id}`);
      } else {
        console.log(`     ❌ Failed: ${result.error}`);
      }
    } catch (error: any) {
      console.log(`     ❌ Error: ${error.message}`);
    }

    // Small delay to avoid overwhelming the system
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log('\n🎧 Generating 5 lofi videos (30+ min each)...\n');

  // Generate lofi videos
  for (let i = 0; i < 5; i++) {
    const style = lofiStyles[i];
    const duration = style.duration * 60; // Convert to seconds

    const title = `${style.vibe} Lofi Mix - ${style.duration} Minutes 🎧 Chill Beats`;
    const scriptContent = `${style.description} | target ${style.duration}:00 length | 80-85 BPM | lofi hip hop, chill beats`;

    console.log(`  ${i + 1}/5: ${title} (${style.duration}:00)`);

    try {
      const response = await fetch(`${apiUrl}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'music',
          scriptName: title,
          scriptContent: scriptContent,
          duration: duration,
          aspectRatio: '9:16',
          musicStyle: 'lofi',
          bpm: 82,
          autoUpload: false,
        }),
      });

      const result = await response.json();
      if (result.success) {
        console.log(`     ✅ Job created: ${result.data.id}`);
      } else {
        console.log(`     ❌ Failed: ${result.error}`);
      }
    } catch (error: any) {
      console.log(`     ❌ Error: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log('\n✅ All jobs created! Check http://localhost:8080/jobs to monitor progress.\n');
}

function generateTrapName(): string {
  const adjectives = [
    'Savage',
    'Ruthless',
    'Demon',
    'Psycho',
    'Cold',
    'Toxic',
    'Deadly',
    'Vicious',
    'Menace',
    'Phantom',
  ];
  const nouns = ['Mode', 'Time', 'Vibes', 'Energy', 'Season', 'Dreams', 'Life', 'World', 'Zone', 'Wave'];

  return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
}

generateWeekContent().catch(console.error);
