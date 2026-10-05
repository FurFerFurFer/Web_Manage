# Character rebuild research — 2026-09-27

## Status: saved for later, no route chosen

The user reopened the character for **research only**, then asked to preserve the options
and analysis: **“ideally i'd want free but I'll decide this later: I'll start building on
the actual learning feature.”** Free is preferred; it is not a selection of Route A and
does not erase the previously accepted possibility of a one-off purchase. No recurring
subscriptions. Character implementation stays deferred; learning-feature work is the next
priority, with its exact increment still to be specified. No character purchase, install,
download, signup, dependency or implementation was authorized or performed.

The concept decision is recorded in [draft §4](TRACK-WORLD-CONCEPT-DRAFT.md#4-player-perspective-and-movement).
This file preserves the research, not a production commitment. Prices, availability,
licences and compatibility below were checked during the September 27 research and must
be rechecked before acquisition. No checkout, tool launch or imported-character benchmark
was performed. The uninspected external reference image in draft §4 remains uninspected;
its URL could not be retrieved during this research.

## Target and independent starting point

The target remains Aether/Genshin appearance and core movement, adapted to the botanical
theme with the notebook replacing the sword. Core means four locomotion tiers and their
transitions, starts, stops, turns, idle, jump, free fall, glide, light landing, climbing,
rapid climb and the climb-to-ledge vault, with notebook carry/stow throughout. The base
“walk” tier is a jog-class gait; no slow-walk control or heavy landing roll is requested.

The research read [retrospective §1–6](RETROSPECTIVE-2026-09-23.md) and all four
[analysis images](assets/images/analysis/) before forming its shortlist; §7 was read only
afterward. The images and `character-rig.js` substantiate the structural problem: overlapping
rigid pieces cannot develop continuous joint deformation through angle tuning. A replacement
needs a deforming mesh, deliberate character shading, and motion authored for its silhouette.
Buying a mesh and obtaining the finished performance are separate tasks.

## Routes and money

USD listing prices, before checkout taxes. Asset/software cost is separate from labour.

| Route | What it gives | Money | Time and effort | What it does not supply |
| --- | --- | --- | --- | --- |
| **A — Native Blender, free foundations** | Direct control over an original or freely licensed model, outfit, deformation and poses | Free baseline; optional animation Source packs $14.99 each, $29.98 together | Highest personal learning and art-production effort; complete schedule unknown | Installing Blender or importing a base does not create the target character or polished animation |
| **B — Buy an anime base, finish it in Blender** | Prepared anime anatomy and rig, reducing some setup | Meng Low base $30 Standard once; $60 Extended Commercial; optional animation packs extra | Less anatomy/rig preparation, but substantial design, animation and integration; complete schedule unknown | No locomotion clips advertised; no finished traveler, book handling or proven Babylon materials |
| **C — Commission original character and tailored motion** | Artist/animator expertise directed at the actual visual target | One-off project quote unknown; no recurring service inherently necessary | Lowest personal modelling effort, substantial briefing/review; full delivery time unknown | Payment alone guarantees neither quality, source rights, complete motions nor laptop performance |

**Research recommendation, not user selection:** C has the strongest prospect of meeting
the demanding visual target, conditional on a suitable quote and demonstrated work. A is
the strongest alternative when minimizing money or learning production personally is the
priority. B is worthwhile only if its base already looks close enough to save meaningful
work. The user's subsequent preference is **free if possible, decide later**; no route
was accepted. Do not silently turn the recommendation into approval or the preference
into a completed production decision.

### A — Free foundations and the payoff from learning Blender

- [Blender Studio Human Base Meshes](https://www.blender.org/download/demo-files/) are
  free CC0 anatomy foundations, not finished anime characters.
- [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html)
  advertise humanoid rigs, regular/teen proportions, interchangeable hair and about 13k
  triangles per model. Standard is free; the editable Source edition is **$19.99 once**
  on the [creator's listing](https://quaternius.itch.io/universal-base-characters).
- Learning modelling, painting, skinning (making the surface follow bones), and keyframe
  editing buys direct control of the face, silhouette, continuous joints, costume and
  poses. Rigify supplies animation controls, not finished movement or automatic art quality.
- Original Blender artwork remains the creator's property; Blender does not impose its
  software GPL on artwork. CC0 permits modification, private use and redistribution,
  including a book replacement and public source files. Imported material keeps its own
  licence. [Blender artwork rights](https://www.blender.org/about/license/),
  [CC0 terms](https://creativecommons.org/publicdomain/zero/1.0/).
- Visual examples: [Galaxy Chan, authored anime appearance and motion in Blender](https://pierreschiller.artstation.com/projects/QndKv4)
  and [Snow parkour animation](https://studio.blender.org/characters/snow/showcase/6/).
  These establish artistic possibilities, not this laptop's game performance or a
  beginner's expected result. Snow was a multi-person production over approximately four
  months; it is not evidence that a finished game character is a short setup task.

### B — The named paid base

[Meng Low's Anime Male Base Mesh Age Kit](https://menglow.artstation.com/store/ajr6q/anime-male-base-mesh-age-kit)
is **$30 Standard / $60 Extended Commercial**, one-off. It includes Blender/FBX/OBJ files,
Blender 3/4 rigs, 4K painted textures and facial shapes. Bases are approximately
17,800–18,200 triangles. The advertised ages are **4, 8, 12 and 16**: this is a youthful
base kit, not an already-designed adult botanical traveler. No locomotion clips are
advertised. [Seller's rig video](https://youtu.be/MPI1TMFeUEY); the product gallery is the
appearance preview.

The desired face/proportions, costume, hair/braid, cloth movement, notebook, browser
materials, motion and integration still need work. Blender-version support and file
formats do not prove that the seller's full control rig or shading survives GLB export.

The [ArtStation product licence](https://www.artstation.com/marketplace-product-eula)
allows modifications and personal game use, including restyling and the book change.
It does **not clear public redistribution of the purchased source asset**. Extended
Commercial does not remove that restriction. Restricted files would need to remain out
of public Git, or the seller must grant additional permission. Converting FBX to GLB
does not remove the licence. The linked April 2025 website terms preserve the seller's
separate product licence; they do not replace it.

### C — Commission evidence and missing terms

- [Seraphyaa's portfolio/commission information](https://seraphyaa.design/) demonstrates
  specifically HoYoverse-style original characters. Published model price **$300–600**,
  stated time **2–3 months**; animation separately **$100+**, **3 weeks–1 month**.
  **Both services were closed when checked.** PMX model delivery is not Babylon-ready.
  These are style/price examples, not an available quote for the whole task.
- [LessaB3D's commissioned-character gallery](https://sketchfab.com/lessaB3D/collections/anime-3d-commissions-custom-stylized-models-8ad7de935c8642acad73a7bf55178cfa)
  gives additional anime examples; the [creator's storefront](https://cubebrush.co/thiagolessa90)
  advertises commissions. This project's price, schedule, full animation capability,
  delivered complexity and licence remain unknown. A modelling portfolio alone does not
  establish full movement delivery.

A prospective agreement would need an original design, editable `.blend`, browser-ready
GLB (model/textures/animations), the full movement list, and an actual-laptop acceptance
proof. It must explicitly allow restyling, book replacement, private game use, later
editing, and public source redistribution if those files are to live in this repository.
Paying for a commission does not itself settle those rights. No artist was contacted.

## Stock motion: a starting point, not the target performance

| Pack | Free edition | One-off paid editions |
| --- | --- | --- |
| [Quaternius Universal Animation Library](https://quaternius.itch.io/universal-animation-library) | Standard; creator's [OpenGameArt post](https://opengameart.org/content/universal-animation-library) specifies 45 animations | Pro $9.99; Source $14.99 with editable Blender material and the full 120+ library |
| [Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2) | Standard subset; exact current count unverified | Source $14.99 with editable Blender material and the full 130+ library |

Both advertise versions with root motion disabled: clips animate the body while the
existing controller moves the player. Source editions together are **$29.98**; no
subscription is required. Do not call all 120+/130+ animations free. Exact current
free-versus-paid clip membership was not certified without acquisition.

Both named libraries advertise **CC0**, permitting edits and source redistribution.
Quaternius also introduced a different [asset licence](https://quaternius.com/license.html)
on 2026-08-28 that restricts standalone redistribution for packs released under it. It does
not automatically override the named packs' CC0 listings. Verify the included licence on
eventual authorized acquisition; never assume every pack from this creator is CC0.

Motion previews: [Library 1 video](https://www.youtube.com/watch?v=-VXFlXhvD6A),
[Library 2 video](https://www.youtube.com/watch?v=2Hd5nH122OE),
[interactive viewer](https://quaternius.com/animviewer.html).

| Core movement | Verified starting coverage | Remaining custom work for A/B; explicit commission scope for C |
| --- | --- | --- |
| Four locomotion tiers | Generic jog, sprint and directional locomotion advertised | Target poses, stride/contact, four distinct tiers at accepted speeds/cadence |
| Idle, starts, stops, turns, transitions | Complete target combination unverified | Select/author clips and transitions without delaying controls |
| Jump and light landing | Aether-equivalent coverage unverified | Takeoff, airborne progression, shallow landing and run-out |
| Free fall and glide | Matching stock set unverified | Referenced held poses, sway, deployment/recovery and glider appearance |
| Climbing | General parkour description does not establish required wall-climb performance | Reach, grip, feet, directional changes and wall contact |
| Rapid climb and climb-to-ledge vault | Exact target coverage unverified | Bespoke animation and proof against unchanged controller behaviour |
| Notebook carry/stow throughout | No candidate supplies this project's behaviour | Attachments, hand poses, transfers, hair/cloth follow-through |

Unverified does not mean a pack has no relevant clip. Every route still needs visual
matching; generic clips are not Genshin data. Commissioning a model alone covers none of
the required animation set. Heavy landing/roll stays out of scope.

## Laptop, public repository and Babylon fit

Read-only local checks found Ubuntu **24.04.4 LTS**, glibc **2.39**, Ryzen **5 5500U**
(six cores/twelve threads), integrated AMD **Lucienne Radeon**, approximately **14 GiB
usable RAM**, and Mesa **25.2.8**. Blender and Wine were absent from the checked executable
and package locations. Native Blender is supported on Linux; the CPU/RAM meet its stated
minimums, but GPU requirements and responsiveness need a launch test. **Blender 4.5 LTS**
is a candidate because its older-GPU support is broader than current releases.
[Official requirements](https://www.blender.org/download/requirements/).

The remote is `github.com/FurFerFurFer/Web_Manage`. An unauthenticated, read-only GitHub
API response returned **`private: false`, `visibility: public`**. Private personal use
does not make asset files pushed to that remote private. This changes the paid-base,
Mixamo and commission licence analysis. Repository visibility must be rechecked later.

| Route | Authoring compatibility | Runtime cost on this laptop |
| --- | --- | --- |
| A | Native Blender; launch/responsiveness untested | Unknown; a 13k-triangle foundation is not an FPS guarantee |
| B | Native Blender reads the supplied formats; specific rig/export untested | Unknown; published counts cover bases, not finished outfit/hair/materials |
| C | Artist may author elsewhere; request Blender/GLB delivery for local use | Unknown; commissioning does not remove the laptop ceiling |

The existing demo's sustained 720p/30 fps hardware target remains unproved; its automated
browser tests use SwiftShader. Skinning adds deformation work, while replacing many
separate rigid pieces may reduce draw calls. Net cost depends on the delivered mesh,
materials, textures, bones, shadows and secondary motion, and cannot be inferred from
either the number of pieces or a seller's “game-ready” label.

All three routes can retain the vendored **Babylon 9.25.0** and avoid npm, Unity or Unreal:

- The demo retains Babylon core, not a glTF loader. A version-matched loader would be a
  separately approved, vendored dependency loaded through a plain script.
  [Official loader documentation](https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/importers/loadingFileTypes.md).
- `tools/serve.js` excludes an asset directory and sends `connect-src 'none'`. A local
  GLB would require scoped asset-serving/CSP changes; import is not currently plug-and-play.
- Blender's toon nodes do not automatically transfer through GLB. Export deformation
  bones and animation; supply corresponding Babylon materials, plus exported bone
  animation or deliberately implemented hair/cloth motion. Installing Blender is an
  authoring choice, not a requirement to run Blender while playing the game.
  [Export constraints](https://docs.blender.org/manual/en/4.2/addons/import_export/scene_gltf2.html).
- `character-motion.js` already observes resolved controller state. The new body should
  follow that feed, leaving **5.2/12/16.2**, accepted cadence, collision, stamina, Space,
  camera and glide clearance untouched. In-place clips prevent animation moving the
  simulation body. Stride/contact still need adaptation; simply speeding up a clip is
  not proof of reference fidelity.
- `scene.js` has continuous climbing and an immediate ledge step-over, with no separate
  rapid-climb action. Visual choreography can be developed around these, but exact
  reference traversal cannot be promised through an asset swap with controller behaviour
  frozen. This is a specific proof limit, not authorization to change the controller.

## Other tools and routes considered

- **VRoid:** free anime character editor; official support is Windows/macOS/iPad, not
  native Ubuntu. Proton/Wine compatibility here is unknown. Created-model rights permit
  useful customization; downloaded models have separate terms. VRM conversion, browser
  shading and motions remain work. [Platforms and rights](https://vroid.com/en/studio).
- **Mixamo:** free with an Adobe ID, no subscription. Useful generic humanoid rigging and
  stock motion; successful browser rigging/export here untested. Private game use and
  edits are allowed, but standalone raw-file redistribution is restricted. This is less
  convenient than explicitly CC0 clips for the public repository. Large hair, clothing
  and props may defeat its auto-rigger; it does not supply this character's complete
  motion style. [FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html),
  [content-file terms §3.6](https://www.adobe.com/legal/terms.html).
- **Cascadeur:** animation aid, not a character creator. Free-plan export is restricted;
  paid plans use subscriptions with a retained-version option, rather than an ordinary
  one-off purchase. The pricing page's cards and FAQ disagreed, so no dependable quote
  was established. Official Ubuntu support pages did not clearly cover 24.04 or this GPU.
  Adds cost/compatibility uncertainty without delivering the target.
  [Plans](https://cascadeur.com/plans), [Ubuntu support](https://cascadeur.com/help/installation/ubuntu).
- **Official HoYoverse MMD model:** authoritative accessible terms did not establish
  permission for the requested adaptation/game/public-source use. Not a cleared route;
  do not equate fan-video permission with this use or claim a definitive no-edit rule.

## Independent view of the retrospective

Agree with the structural diagnosis, stopping repeated rigid-rig tuning, treating
one-off money separately from subscriptions, and judging appearance by comparison rather
than test counts. Differences/qualifications after reading §7:

1. Procedural animation is not inherently incapable of expressive timing. This body and
   production method are the limitation. Authored clips can coexist with procedural
   contact correction and secondary motion; a deforming character need not be one mesh.
2. Unsupported VRoid-on-Linux should not be the default first route when native Blender
   production is available. Compatibility troubleshooting would not establish art quality.
3. A poor result with one model does not prove the laptop cannot handle skinned characters;
   separate asset/material complexity from the technique before abandoning it.
4. Babylon's licence is **Apache-2.0, not MIT**.
   [Pinned-version licence](https://github.com/BabylonJS/Babylon.js/blob/9.25.0/license.md).
5. The retrospective's blanket official-MMD editing prohibition was not independently
   verified from authoritative accessible terms. Permission remains unknown, not cleared.
6. Quaternius Library 2 Source was **$14.99** at this check, rather than the earlier $20.
   Exact free-tier coverage and new pack-specific licensing must not be glossed over.

## If the user later resumes the decision

The unanswered personal factors are the total one-off budget ceiling, willingness to do
the modelling/animation personally, and whether every character source file must be
publishable in public Git. Free is now the stated preference, not a hard prohibition on
the paid alternatives. Do not ask for a route or resume character work during an unrelated
learning-feature task.

The research recommended a limited in-Babylon visual proof before a full commission:
approved silhouette, bending joints, base/run motion, stop and book handling, compared
with the reference. This remains a proposal. If it still looks wrong, do not expand on
the strength of passing tests. If it looks right but runs poorly, simplify and measure
that asset before rejecting skinning itself. Any eventual install, acquisition, spending,
dependency or implementation retains the existing approval gates.
