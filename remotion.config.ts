import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setEntryPoint("video-factory/index.ts");
Config.setConcurrency(2);
Config.setOverwriteOutput(true);
