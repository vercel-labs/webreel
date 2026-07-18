export {
  DEFAULT_CONFIG_NAME,
  DEFAULT_CONFIG_FILE,
  loadWebreelConfig,
  getConfigDir,
  filterVideosByName,
  resolveConfigPath,
} from "./config/loader.js";

export {
  CURRENT_SCHEMA_VERSION,
  parseSchemaVersion,
  validateWebreelConfig,
} from "./config/validate.js";

export type { ValidationError } from "./config/errors.js";
export { buildLineMap, formatValidationErrors } from "./config/errors.js";
