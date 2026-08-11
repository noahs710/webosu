// Register all mods with the ModRegistry.
// Imported for its side effect by initgame.js.
import { ModRegistry } from "./index.js";

// Difficulty Increase
import { ModHardRock } from "./difficulty/HardRock.js";
import { ModDoubleTime } from "./difficulty/DoubleTime.js";
import { ModNightcore } from "./difficulty/Nightcore.js";
import { ModHidden } from "./difficulty/Hidden.js";

// Difficulty Reduction
import { ModEasy } from "./difficulty/Easy.js";
import { ModHalfTime } from "./difficulty/HalfTime.js";
import { ModDifficultyAdjust } from "./difficulty/DifficultyAdjust.js";
import { ModNoFail } from "./reduction/NoFail.js";
import { ModSuddenDeath } from "./reduction/SuddenDeath.js";
import { ModPerfect } from "./reduction/Perfect.js";
import { ModSpunOut } from "./reduction/SpunOut.js";

// Automation
import { ModAutoplay } from "./automation/Autoplay.js";
import { ModRelax } from "./automation/Relax.js";
import { ModAutoPilot } from "./automation/AutoPilot.js";

// Conversion
import { ModClassic } from "./conversion/Classic.js";
import { ModTargetPractice } from "./conversion/TargetPractice.js";

// Fun
import { ModFlashlight } from "./fun/Flashlight.js";
import { ModAdaptiveSpeed } from "./fun/AdaptiveSpeed.js";
import { ModMagnetised } from "./fun/Magnetised.js";
import { ModWobble } from "./fun/Wobble.js";
import { ModWindUp } from "./fun/WindUp.js";
import { ModTraceable } from "./fun/Traceable.js";
import { ModApproachDifferent } from "./fun/ApproachDifferent.js";
import { ModBubbles } from "./fun/Bubbles.js";
import { ModRepel } from "./fun/Repel.js";
import { ModDepth } from "./fun/Depth.js";
import { ModTransform } from "./fun/Transform.js";
import { ModNoScope } from "./fun/NoScope.js";

ModRegistry.register(ModHardRock);
ModRegistry.register(ModDoubleTime);
ModRegistry.register(ModNightcore);
ModRegistry.register(ModHidden);
ModRegistry.register(ModEasy);
ModRegistry.register(ModHalfTime);
ModRegistry.register(ModDifficultyAdjust);
ModRegistry.register(ModNoFail);
ModRegistry.register(ModSuddenDeath);
ModRegistry.register(ModPerfect);
ModRegistry.register(ModSpunOut);
ModRegistry.register(ModAutoplay);
ModRegistry.register(ModRelax);
ModRegistry.register(ModAutoPilot);
ModRegistry.register(ModClassic);
ModRegistry.register(ModTargetPractice);
ModRegistry.register(ModFlashlight);
ModRegistry.register(ModAdaptiveSpeed);
ModRegistry.register(ModMagnetised);
ModRegistry.register(ModWobble);
ModRegistry.register(ModWindUp);
ModRegistry.register(ModTraceable);
ModRegistry.register(ModApproachDifferent);
ModRegistry.register(ModBubbles);
ModRegistry.register(ModRepel);
ModRegistry.register(ModDepth);
ModRegistry.register(ModTransform);
ModRegistry.register(ModNoScope);

// All mods registered.

export { ModRegistry };