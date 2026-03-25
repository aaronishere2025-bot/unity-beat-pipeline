"""
Unity Video Pipeline - GPT-5.1 Version
Usage: python unity_pipeline.py "Genghis Khan" "conquest of China"
"""

import json
import os
import sys

from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY"),
    base_url=os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
)

MODEL = "gpt-5.1-chat-latest"


def research_story(figure: str, query: str) -> dict:
    print(f"[RESEARCH] {figure} - {query}")
    
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{
            "role": "user",
            "content": f"""Research {figure} specifically focusing on: {query}

Return a JSON object with this structure:
{{
    "basic_info": {{"name": "", "era": "", "region": "", "role": ""}},
    "story_context": {{"summary": "", "timeline": "", "key_players": [], "stakes": ""}},
    "character_appearance": {{"physical": "", "age_in_story": "", "distinctive_features": "", "primary_outfit": "", "accessories": "", "presence": ""}},
    "visual_settings": {{"primary_location": "", "secondary_locations": [], "era_aesthetics": "", "iconic_imagery": [], "color_palette": ""}},
    "narrative_elements": {{"opening_scene": "", "rising_action": "", "climax": "", "resolution": "", "aftermath": ""}},
    "thematic_debate": {{"defender_view": [], "critic_view": [], "complexity": "", "lesson": ""}}
}}

Be SPECIFIC with visual details. Return ONLY valid JSON."""
        }],
        response_format={"type": "json_object"}
    )
    
    return json.loads(response.choices[0].message.content)


def generate_lyrics(figure: str, query: str, research: dict) -> str:
    print(f"[LYRICS] Generating...")
    
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{
            "role": "user",
            "content": f"""Write lyrics for a music video about {figure}: {query}

RESEARCH: {json.dumps(research)}

STRUCTURE:
### [INTRO: LOOKING AROUND] - 6s (2-4 lines)
### [VERSE 1: LOOKING DOWN] - 28s (12-16 lines)
### [CHORUS: THE TURN] - 11s (4-6 lines)
### [VERSE 2: LOOKING SIDEWAYS] - 28s (12-16 lines)
### [CHORUS: THE TURN] - 11s
### [BRIDGE: THE REALIZATION] - 16s (6-8 lines)
### [FINAL CHORUS: LOOKING UP] - 11s
### [OUTRO: THE LANDING] - 10s (4 lines)

AABB rhyme scheme. Use specific historical details."""
        }]
    )
    
    return response.choices[0].message.content


def generate_veo_prompts(figure: str, query: str, research: dict, lyrics: str) -> str:
    print(f"[VEO] Generating prompts...")
    
    app = research.get("character_appearance", {})
    char_lock = f"{figure.upper()}: {app.get('physical', '')}. Outfit: {app.get('primary_outfit', '')}. Accessories: {app.get('accessories', '')}."
    
    response = client.chat.completions.create(
        model=MODEL,
        messages=[{
            "role": "user", 
            "content": f"""Generate 8 VEO prompts for: {figure} - {query}

CHARACTER (use in EVERY prompt): {char_lock}

SETTINGS: {json.dumps(research.get('visual_settings', {}))}
STORY: {json.dumps(research.get('narrative_elements', {}))}
LYRICS: {lyrics}

For each section (INTRO 6s, VERSE1 28s, CHORUS1 11s, VERSE2 28s, CHORUS2 11s, BRIDGE 16s, FINAL CHORUS 11s, OUTRO 10s):

## [SECTION] (Xs)
**Setting**: Location
**Prompt**: Character description + action + handheld camera + practical lighting + desaturated colors

Same character description in EVERY prompt."""
        }]
    )
    
    return response.choices[0].message.content


def run_pipeline(figure: str, query: str):
    print(f"\n{'='*50}\nUNITY PIPELINE (GPT-5.1): {figure} - {query}\n{'='*50}")
    
    os.makedirs("output", exist_ok=True)
    name = figure.lower().replace(' ', '_')
    
    research = research_story(figure, query)
    with open(f"output/{name}_research.json", 'w') as f:
        json.dump(research, f, indent=2)
    print(f"[SAVED] output/{name}_research.json")
    
    lyrics = generate_lyrics(figure, query, research)
    with open(f"output/{name}_lyrics.md", 'w') as f:
        f.write(f"# {figure} - {query}\n\n{lyrics}")
    print(f"[SAVED] output/{name}_lyrics.md")
    
    veo = generate_veo_prompts(figure, query, research, lyrics)
    with open(f"output/{name}_veo.md", 'w') as f:
        f.write(f"# {figure} - {query}\n\n{veo}")
    print(f"[SAVED] output/{name}_veo.md")
    
    print(f"\n{'='*50}\nDONE! Check output/ folder\n{'='*50}")
    return {"research": research, "lyrics": lyrics, "veo": veo}


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print('Usage: python unity_pipeline.py "Figure" "Story"')
        sys.exit(1)
    run_pipeline(sys.argv[1], sys.argv[2])
