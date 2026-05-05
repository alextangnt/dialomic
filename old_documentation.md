This project began because I wanted to make a storytelling tool for artists. I like comics, I like interactive media, I like games and funky little clickable tools, but I’m not very good at making games. I like picking through the capabilities of tools people give me and see how funnily I can make them spin. By making a tool *I* can use, that my friends and I can use, I’m shortcutting the “What do I use to tell my story” step that I always deliberate on.

![Template that translates Twine html (below) into visual “webcomic” format, generating a random three.js box per node](https://miro.medium.com/v2/resize:fit:1280/format:webp/1*jT4NkjpcLR5z5InjlLv8Mg.gif)![Running the text only Twine .html file](https://miro.medium.com/v2/resize:fit:1280/format:webp/1*VyeRhqvG0sk6zif_QAm3fQ.gif)

When I was given access to Twine and told to make a very basic story, I read through a good deal of the Twine Harlowe (default story format) documentation and made a silly randomized project that looped on itself, rather than attempting to tell a good story. Y/N, equipped with a handy pocket-burger, climbs through an eternal construction site and talks to a randomized NPC at every level. The “game” ends when you’ve completed seven loops and have picked up a screw from the ground at every level. I was chuffed at the fact I could code a parametrized “narrative” game like that.

That’s not to say I don’t like to make good stories. When I’m not working my ass off in my CS cores, I’m usually creating original characters who have wacky stories of their own and live in wide, ironic, contradictory literary worlds that I illustrate. I just often struggle to find a suitable way to Tell these stories. Can I really draw unique cutscenes for every character? Draw every background for a visual novel?...

There's something I really love about Twine, and that's how powerful it is, while having an extremely simple base UI. Fully text based stories. So let's start simple: my concept is to make a tool for users to create interactive webcomics.

1. I decided to just *use* Twine for narrative/dialogue flow. I want to keep the variables, scripting, conditional logic, etc, of Twine. 
2. Then, I'll have the user be able to define simple parametrized scenes for each node within their Twine stories. Since I want to go 3D, I'll use THREE.js for this.
3. From there, there are tons of additional features to be parametrized so that an author can control how their stories look. More scene elements. Animation. UI. You name it.

## STEP 1
### Making Twine work for me
![Twine app GUI with examples of Twine Sugarcube formatting](https://miro.medium.com/v2/resize:fit:1400/format:webp/1*Rn53v6zbWyNyQWdVDuOqIw.png)![How it compiles into a runnable .html](https://miro.medium.com/v2/resize:fit:1400/format:webp/1*wgPxm19IpxbotVPNq_gZBA.png)![Part of messaging script I attach to that .html file. Controls clicking links, restarts, etc.](https://miro.medium.com/v2/resize:fit:1400/format:webp/1*LzKQ5Z8nhnEezGdbktk_Rg.png)![:passageend is an event that Sugarcube .html files will send out when the passage finishes loading in the iframe](https://miro.medium.com/v2/resize:fit:1400/format:webp/1*SOPT6sAeruWV1j8DzoVHyQ.png)

So now, I have code that reads from a headless Sugarcube-compiled .html file as a logic engine, and a p5js file that is sent passages. A click onto this p5js canvas simulates a click into the hidden Sugarcube iframe. It’s clean, it’s stupid, it works.

The next step is making something that actually looks nice. I wanted users of my tool to be able to import 3D models + bgs + objects with preset poses that they could procedurally tell, within some Twine code, how to pose and frame themselves within a comic panel. How do I incorporate both 3D and 2D graphics at all? three.js!

My current template generates a random cube + bg color just as a proof of concept (per panel). When you revisit a panel, it shows the same object as before.

Next, after importing some very simple placeholder 3d models and objects and scenes, I will be integrating scene composition based on variables users set in Twine. I already can access variables as soon as they are updated per node.

## STEP 2
### Set the scene

While I would love for rigged models to be imported into scenes, then placed in neat environments with total control over lighting and camera and whatnot, I decided to scale down my prototype into something simple for a user to control.

![Array of rats! In every specified location!](documentation/rats.png)

I'll be using David OReilly's everything models for now. [Animals](https://davidoreilly.itch.io/everything-library-animals)! They make great, lowpoly building blocks for simple to complex iconographic stories.

![Examples of the positioning notation and syntax](documentation/ratsandcow.png)

Given just a few common animals and my positioning syntax, I imagine users will be still able to tell a wide variety of fable-like stories, along with whatever they may want to tell. For now, I hope this limitation allows users to have fun and be creative without being too nitpicky about what is shown onscreen.

### STEP 2.5
Publishing to the web and an interface overhaul!

![New UI. Includes restart button and a file import](documentation/ui.png)

This next step is about how I want to present my tool to the user. After some research and consultation from Codex, it turns out I can't compile Twine's .twee native files into Sugarcube HTML files in the browser, because [Tweego](https://www.motoslave.net/tweego/) is a CLI. This just means that the user has to import an already compiled .html file from the app, which is just an additional step. 

![Imported file working!](documentation/imported.png)

Nonetheless, I added a UI bar at the top of Dialomic for users to import their own .html stories to run instead of my default tutorialish file!

Finally, I published the file on Github pages here: https://alextangnt.github.io/dialomic/

This was done with lots of help from Codex, because I had no idea how to set up a Github workflow, nor how to do Vite development with a to make a start script that will modify input files and delete them.


## NEXT STEPS

* Get some speech bubbles in there! Handle overlap and layering logic! Figure out who's saying what.
* Import some background presets to use.
* Procedural animation in panels?

![Speech bubbles and speaker animations](documentation/dialomic_animatedwithdialogue.gif)


## 4. Current Architecture (High Level)
### Player Runtime
- Entry/UI: `index.html`, `player.html`
- Orchestration: `src/layout.js`
- Panel rendering: `src/panel.js`
- Bubble engine: `src/speechBubbles.js`
- Iframe bridge: `public/messaging.js`

Flow:
1. Player loads selected story HTML into iframe.
2. Iframe emits passage events.
3. Dialomic parses passage body and `$DL` scene config.
4. Three.js panels, narration, and speech bubbles are rendered.
5. Choice/input events are forwarded back into the Twine runtime.

### Visual Editor Runtime
- Entry: `visual-editor.html`
- Main logic: `src/visualEditor.js`
- Reuses shared render/text modules (`panel`, `speechBubbles`, `passageText`).

Flow:
1. Load story HTML.
2. Parse passages into editor-selectable units.
3. Render selected passage scene in preview mode (story flow does not run).
4. Edit models/background/dialogue/narration/choices.
5. Save/export updated story HTML.

## 5. File Management Model (Contained, Browser-Local)
Dialomic now uses contained file management centered on browser-local state during editing sessions:
- Imported/active story content is staged in browser storage.
- Editor and Player share the active story context.
- Changes are applied in-memory first, then committed on explicit save/export actions.
- Default stories are discovered via `public/defaultstories/index.json` (generated from filesystem during build/dev).

This avoids requiring a server-side compiler/runtime and keeps author workflow portable for static hosting (including GitHub Pages).

## 6. Story Data Contracts
### Scene Contract (`$DL`)
Common keys include:
- `objects`
- `background`
- `skyColor`
- `camera`
- `config` (panel stacking/grid/aspect behavior)

### Dialogue Contract
- Speech lines: `speaker:: text`
- Non-speaker paragraphs: narration
- Hidden tail/system section marker: `%%%`
- Per-passage command tokens: `%%...%%`

These conventions remain compatible with text-first authoring while enabling deterministic visual parsing.

## 7. Author Workflow (Current)
1. Open Dialomic landing page.
2. Start from template/default story or upload an HTML story.
3. Open story in Player to test branching and pacing.
4. Enter Visual Editor from Player.
5. Edit passage-level scene and text content.
6. Save story, preview in Player, iterate.
7. Export final HTML. Share with friends!

## 9. The Future of Dialomic
There is no limit to the features I want to add, even at this current stage and release. Some of these features may require a major rework of my general editor layout, which can definitely be a bit of a pain.
- Manual bubble layout!
- Interactive choice editor and creation
- Renaming stories, renaming passages