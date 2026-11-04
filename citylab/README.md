# HACKERPUNK Citylab 0.2

Streets-first sci-fi district generator and desktop traversal preview. Live at https://punk.tront.xyz/citylab/ . The offline HACKERPUNK-Citylab-v0.2.html includes its dependencies.

Six contiguous districts across 36 blocks: Foundry industrial halls and tanks; Corporate Crown tapered glass towers and a civic bridge; Relay armored data centers; Stacks perimeter housing and balconies; Nightmarket shopfronts, stalls and internal lanes; Garden Terraces stepped residences, water courts and planting. The platform concept is retained with 47 elevated connections.

Original shaders generate filtered full-bay facades and approximate parallax rooms. Ground and platform surfaces have explicit ownership; bridge/platform ends join without overlaps. Intakes, planter soil and water basins have actual recessed geometry rather than near-coplanar skins. Small decoration is non-colliding.

## Controls

WASD and right-drag look, Shift faster, E/Q vertical in fly mode. F switches fly/walk. E climbs structural surfaces. Space jumps; hold while airborne with augmented gear to thrust. 1 human / 2 augmented / 3 grapple. L toggles low gravity. Click captures the mouse in walk mode, then hold left click for tier-3 grapple. Esc releases capture.

B tours districts; V cycles viewpoints; R rerolls; T enters a seed; G greybox; Alt+D dressing; N lighting; O optional SSAO; [ and ] height; Tab hides HUD; H controls; J exports recipe/compiled architecture/collision; P screenshot.

## Source and tests

District planning, geometry and surface audits are in districts.js. Rendering, desktop movement, HUD and batching are in citylab.js. test-districts.mjs tests five seeds at three heights. qa-v02.cjs captures the districts, greybox and night, checks browser errors, regeneration, controls and offline startup. The browser harness renders one frame at a time on SwiftShader; it is not a performance benchmark.

REFERENCE-STUDY.md lists the CityWorks, Metroforge and Slop New York source studied. Reference repositories were not modified. No commercial pack assets are used. Three.js is MIT licensed.

## Limitations

Not a finished VR game or commercial environment pack. Orthogonal arterials with variable dimensions, not a port of the full CityWorks street graph. Tapered structures use conservative AABB collision. Distant skyline is non-colliding. No progression, missions, multiplayer, streaming or Quest performance claim. Coplanar audits cover registered ground/platform surfaces and road/massing exclusions; they do not prove every driver/viewpoint artifact-free.
