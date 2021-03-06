import { motion, AnimatePresence } from "framer-motion";
import orderBy from "lodash/orderBy";
import PropTypes from "prop-types";
import React, { useCallback, useState, useReducer } from "react";
import {
	DIFFICULTY,
	applyRealTeamInfo,
	PHASE,
	PHASE_TEXT,
	DEFAULT_CONFS,
	DEFAULT_DIVS,
	gameAttributeHasHistory,
} from "../../../common";
import { LeagueFileUpload, PopText } from "../../components";
import useTitleBar from "../../hooks/useTitleBar";
import {
	confirm,
	helpers,
	logEvent,
	realtimeUpdate,
	toWorker,
	safeLocalStorage,
} from "../../util";
import type {
	View,
	RealTeamInfo,
	GetLeagueOptions,
	Div,
	Conf,
} from "../../../common/types";
import classNames from "classnames";
import { descriptions } from "../Settings";
import LeagueMenu from "./LeagueMenu";
import LeaguePartPicker from "./LeaguePartPicker";
import type { LeagueInfo, NewLeagueTeam } from "./types";
import CustomizeTeams from "./CustomizeTeams";

const applyRealTeamInfos = (
	teams: NewLeagueTeam[],
	realTeamInfo: RealTeamInfo | undefined,
	season: number = new Date().getFullYear(),
) => {
	if (!realTeamInfo) {
		return teams;
	}

	return teams.map(t => {
		if (t.srID && realTeamInfo[t.srID]) {
			const t2 = helpers.deepCopy(t);
			applyRealTeamInfo(t2, realTeamInfo, season);
			return t2;
		}

		return t;
	});
};

const teamsDefault: NewLeagueTeam[] = helpers.addPopRank(
	helpers.getTeamsDefault(),
);

const initKeptKeys = ({
	leagueFile,
	newAllKeys,
	oldKeptKeys,
	oldAllKeys,
}:
	| {
			leagueFile: any;
			newAllKeys?: undefined;
			oldKeptKeys?: string[];
			oldAllKeys?: string[];
	  }
	| {
			leagueFile?: undefined;
			newAllKeys: string[];
			oldKeptKeys?: string[];
			oldAllKeys?: string[];
	  }) => {
	let allKeys;
	if (newAllKeys) {
		allKeys = newAllKeys;
	} else {
		allKeys = leagueFile
			? Object.keys(leagueFile).filter(key => key !== "version")
			: [];
	}

	let keptKeys;
	if (!oldKeptKeys || !oldAllKeys) {
		keptKeys = allKeys;
	} else {
		// If any were unchecked before, keep them unchecked now
		keptKeys = allKeys.filter(key => {
			if (!oldAllKeys.includes(key)) {
				return true;
			}

			return oldKeptKeys.includes(key);
		});
	}

	return {
		allKeys,
		keptKeys,
	};
};

const MIN_SEASON = 1947;
const MAX_SEASON = 2021;

const seasons: { key: string; value: string }[] = [];
for (let i = MAX_SEASON; i >= MIN_SEASON; i--) {
	seasons.push({
		key: String(i),
		value: String(i),
	});
}

const legends = [
	{
		key: "all",
		value: "All Time",
	},
	{
		key: "2010s",
		value: "2010s",
	},
	{
		key: "2000s",
		value: "2000s",
	},
	{
		key: "1990s",
		value: "1990s",
	},
	{
		key: "1980s",
		value: "1980s",
	},
	{
		key: "1970s",
		value: "1970s",
	},
	{
		key: "1960s",
		value: "1960s",
	},
	{
		key: "1950s",
		value: "1950s",
	},
];

const phases = [
	{
		key: PHASE.PRESEASON,
		value: helpers.upperCaseFirstLetter(PHASE_TEXT[PHASE.PRESEASON]),
	},
	{
		key: PHASE.PLAYOFFS,
		value: helpers.upperCaseFirstLetter(PHASE_TEXT[PHASE.PLAYOFFS]),
	},
	{
		key: PHASE.DRAFT_LOTTERY,
		value: helpers.upperCaseFirstLetter(PHASE_TEXT[PHASE.DRAFT_LOTTERY]),
	},
	{
		key: PHASE.DRAFT,
		value: helpers.upperCaseFirstLetter(PHASE_TEXT[PHASE.DRAFT]),
	},
	{
		key: PHASE.AFTER_DRAFT,
		value: helpers.upperCaseFirstLetter(PHASE_TEXT[PHASE.AFTER_DRAFT]),
	},
];

type State = {
	creating: boolean;
	customize: "default" | "custom-rosters" | "custom-url" | "legends" | "real";
	season: number;
	phase: number;
	difficulty: number;
	leagueFile: any;
	legend: string;
	loadingLeagueFile: boolean;
	randomization: "none" | "debuts" | "shuffle";
	teams: NewLeagueTeam[];
	confs: Conf[];
	divs: Div[];
	tid: number;
	pendingInitialLeagueInfo: boolean;
	allKeys: string[];
	keptKeys: string[];
	expandOptions: boolean;
	challengeNoDraftPicks: boolean;
	challengeNoFreeAgents: boolean;
	challengeNoRatings: boolean;
	challengeNoTrades: boolean;
	challengeLoseBestPlayer: boolean;
	challengeFiredLuxuryTax: boolean;
	challengeFiredMissPlayoffs: boolean;
	equalizeRegions: boolean;
	repeatSeason: boolean;
	noStartingInjuries: boolean;
	realPlayerDeterminism: number;
};

type Action =
	| {
			type: "submit";
	  }
	| {
			type: "error";
	  }
	| {
			type: "clearLeagueFile";
	  }
	| {
			type: "setCustomize";
			customize: State["customize"];
	  }
	| {
			type: "setDifficulty";
			difficulty: string;
	  }
	| {
			type: "setPhase";
			phase: number;
	  }
	| {
			type: "setKeptKeys";
			keptKeys: string[];
	  }
	| {
			type: "setLegend";
			legend: string;
	  }
	| {
			type: "setRandomization";
			randomization: State["randomization"];
	  }
	| {
			type: "setSeason";
			season: number;
	  }
	| {
			type: "setTeams";
			teams: NewLeagueTeam[];
			confs: Conf[];
			divs: Div[];
	  }
	| {
			type: "setTid";
			tid: number;
	  }
	| {
			type: "loadingLeagueFile";
	  }
	| {
			type: "newLeagueFile";
			leagueFile: any;
			teams: NewLeagueTeam[];
	  }
	| {
			type: "newLeagueInfo";
			allKeys: string[];
			teams: NewLeagueTeam[];
			confs: Conf[];
			divs: Div[];
	  }
	| {
			type: "toggleExpandOptions";
	  }
	| {
			type: "toggleChallengeNoDraftPicks";
	  }
	| {
			type: "toggleChallengeNoFreeAgents";
	  }
	| {
			type: "toggleChallengeNoRatings";
	  }
	| {
			type: "toggleChallengeNoTrades";
	  }
	| {
			type: "toggleChallengeLoseBestPlayer";
	  }
	| {
			type: "toggleChallengeFiredLuxuryTax";
	  }
	| {
			type: "toggleChallengeFiredMissPlayoffs";
	  }
	| {
			type: "toggleEqualizeRegions";
	  }
	| {
			type: "toggleRepeatSeason";
	  }
	| { type: "toggleNoStartingInjuries" }
	| {
			type: "setRealPlayerDeterminism";
			realPlayerDeterminism: number;
	  };

const getTeamRegionName = (teams: NewLeagueTeam[], tid: number) => {
	const t = teams.find(t => t.tid === tid);
	if (!t) {
		return "";
	}
	return `${t.region} ${t.name}`;
};

const getNewTid = (prevTeamRegionName: string, newTeams: NewLeagueTeam[]) => {
	const newTeamsSorted = orderBy(newTeams, ["region", "name"]);
	const closestNewTeam = newTeamsSorted.find(
		t => prevTeamRegionName <= `${t.region} ${t.name}`,
	);
	return closestNewTeam ? closestNewTeam.tid : newTeams.length - 1;
};

const reducer = (state: State, action: Action): State => {
	switch (action.type) {
		case "submit":
			return {
				...state,
				creating: true,
			};

		case "error":
			return {
				...state,
				creating: false,
			};

		case "clearLeagueFile":
			return {
				...state,
				leagueFile: null,
				loadingLeagueFile: false,
				keptKeys: [],
				teams: teamsDefault,
				tid: getNewTid(getTeamRegionName(state.teams, state.tid), teamsDefault),
			};

		case "setCustomize": {
			const allKeys = action.customize === "default" ? [] : state.allKeys;
			return {
				...state,
				customize: action.customize,
				allKeys,
			};
		}

		case "setDifficulty":
			return {
				...state,
				difficulty: parseFloat(action.difficulty),
			};

		case "setPhase":
			return {
				...state,
				phase: action.phase,
			};

		case "setKeptKeys":
			return {
				...state,
				keptKeys: action.keptKeys,
			};

		case "setLegend":
			return {
				...state,
				legend: action.legend,
			};

		case "setRandomization":
			return {
				...state,
				randomization: action.randomization,
			};

		case "setSeason":
			return {
				...state,
				season: action.season,
			};

		case "setTeams":
			return {
				...state,
				confs: action.confs,
				divs: action.divs,
				teams: action.teams,
			};

		case "setTid": {
			const t = state.teams.find(t => t.tid === action.tid);
			const tid = t ? t.tid : state.teams.length > 0 ? state.teams[0].tid : 0;

			return {
				...state,
				tid,
			};
		}

		case "loadingLeagueFile":
			return {
				...state,
				loadingLeagueFile: true,
			};

		case "newLeagueFile": {
			const prevTeamRegionName = getTeamRegionName(state.teams, state.tid);

			const { allKeys, keptKeys } = initKeptKeys({
				leagueFile: action.leagueFile,
				oldKeptKeys: state.keptKeys,
				oldAllKeys: state.allKeys,
			});

			let confs = DEFAULT_CONFS;
			let divs = DEFAULT_DIVS;

			const gameAttributeOverrides: {
				challengeNoDraftPicks: boolean;
				challengeNoFreeAgents: boolean;
				challengeNoRatings: boolean;
				challengeNoTrades: boolean;
				challengeLoseBestPlayer: boolean;
				challengeFiredLuxuryTax: boolean;
				challengeFiredMissPlayoffs: boolean;
				equalizeRegions: boolean;
				expandOptions: boolean;
				repeatSeason: boolean;
			} = {
				challengeNoDraftPicks: state.challengeNoDraftPicks,
				challengeNoFreeAgents: state.challengeNoFreeAgents,
				challengeNoRatings: state.challengeNoRatings,
				challengeNoTrades: state.challengeNoTrades,
				challengeLoseBestPlayer: state.challengeLoseBestPlayer,
				challengeFiredLuxuryTax: state.challengeFiredLuxuryTax,
				challengeFiredMissPlayoffs: state.challengeFiredMissPlayoffs,
				equalizeRegions: state.equalizeRegions,
				expandOptions: state.expandOptions,
				repeatSeason: state.repeatSeason,
			};
			if (action.leagueFile && action.leagueFile.gameAttributes) {
				for (const { key, value } of action.leagueFile.gameAttributes) {
					// For most settings this passes through the boolean value. For repeatSeason it converts that to a boolean, and it'll be filled later with the actual correct value.
					const booleanValue = !!value;
					if (
						(gameAttributeOverrides as any)[key] !== undefined &&
						(gameAttributeOverrides as any)[key] !== booleanValue
					) {
						(gameAttributeOverrides as any)[key] = booleanValue;
						gameAttributeOverrides.expandOptions = true;
					}

					if (key === "confs") {
						confs = gameAttributeHasHistory(value)
							? value[value.length - 1].value
							: value;
					} else if (key === "divs") {
						divs = gameAttributeHasHistory(value)
							? value[value.length - 1].value
							: value;
					}
				}
			}

			return {
				...state,
				loadingLeagueFile: false,
				leagueFile: action.leagueFile,
				allKeys,
				keptKeys,
				confs,
				divs,
				teams: action.teams.filter(t => !t.disabled),
				tid: getNewTid(prevTeamRegionName, action.teams),
				...gameAttributeOverrides,
			};
		}

		case "newLeagueInfo": {
			let prevTeamRegionName = getTeamRegionName(state.teams, state.tid);
			if (state.pendingInitialLeagueInfo) {
				const fromLocalStorage = safeLocalStorage.getItem("prevTeamRegionName");
				if (fromLocalStorage !== null) {
					prevTeamRegionName = fromLocalStorage;
				}
			}

			const { allKeys, keptKeys } = initKeptKeys({
				newAllKeys: action.allKeys,
				oldKeptKeys: state.keptKeys,
				oldAllKeys: state.allKeys,
			});

			return {
				...state,
				loadingLeagueFile: false,
				leagueFile: null,
				allKeys,
				keptKeys,
				confs: action.confs,
				divs: action.divs,
				teams: action.teams,
				tid: getNewTid(prevTeamRegionName, action.teams),
				pendingInitialLeagueInfo: false,
			};
		}

		case "toggleExpandOptions":
			return {
				...state,
				expandOptions: !state.expandOptions,
			};

		case "toggleChallengeNoDraftPicks":
			return {
				...state,
				challengeNoDraftPicks: !state.challengeNoDraftPicks,
			};

		case "toggleChallengeNoFreeAgents":
			return {
				...state,
				challengeNoFreeAgents: !state.challengeNoFreeAgents,
			};

		case "toggleChallengeNoRatings":
			return {
				...state,
				challengeNoRatings: !state.challengeNoRatings,
			};

		case "toggleChallengeNoTrades":
			return {
				...state,
				challengeNoTrades: !state.challengeNoTrades,
			};

		case "toggleChallengeLoseBestPlayer":
			return {
				...state,
				challengeLoseBestPlayer: !state.challengeLoseBestPlayer,
			};

		case "toggleChallengeFiredLuxuryTax":
			return {
				...state,
				challengeFiredLuxuryTax: !state.challengeFiredLuxuryTax,
			};

		case "toggleChallengeFiredMissPlayoffs":
			return {
				...state,
				challengeFiredMissPlayoffs: !state.challengeFiredMissPlayoffs,
			};
		case "toggleEqualizeRegions":
			return {
				...state,
				equalizeRegions: !state.equalizeRegions,
			};

		case "toggleRepeatSeason":
			return {
				...state,
				repeatSeason: !state.repeatSeason,
			};

		case "toggleNoStartingInjuries":
			return {
				...state,
				noStartingInjuries: !state.noStartingInjuries,
			};

		case "setRealPlayerDeterminism":
			return {
				...state,
				realPlayerDeterminism: action.realPlayerDeterminism,
			};

		default:
			throw new Error();
	}
};

const NewLeague = (props: View<"newLeague">) => {
	const [name, setName] = useState(props.name);
	const [startingSeason, setStartingSeason] = useState(
		String(new Date().getFullYear()),
	);
	const [customizeTeamsUI, setCustomizeTeamsUI] = useState(false);

	const [state, dispatch] = useReducer(
		reducer,
		props,
		(props: View<"newLeague">): State => {
			let customize: State["customize"] = "default";
			if (props.lid !== undefined) {
				customize = "custom-rosters";
			}
			if (props.type === "real") {
				customize = "real";
			}
			if (props.type === "legends") {
				customize = "legends";
			}

			const leagueFile = null;

			const teams = teamsDefault;

			let prevTeamRegionName = safeLocalStorage.getItem("prevTeamRegionName");
			if (prevTeamRegionName === null) {
				prevTeamRegionName = "";
			}

			let season = parseInt(safeLocalStorage.getItem("prevSeason") as any);
			if (Number.isNaN(season)) {
				season = 2021;
			}
			let phase = parseInt(safeLocalStorage.getItem("prevPhase") as any);
			if (Number.isNaN(phase)) {
				phase = PHASE.PRESEASON;
			}

			const { allKeys, keptKeys } = initKeptKeys({
				leagueFile,
			});

			return {
				creating: false,
				customize,
				season,
				legend: "all",
				difficulty: props.difficulty ?? DIFFICULTY.Normal,
				phase,
				leagueFile,
				loadingLeagueFile: false,
				randomization: "none",
				teams: teamsDefault,
				confs: DEFAULT_CONFS,
				divs: DEFAULT_DIVS,
				tid: getNewTid(prevTeamRegionName, teams),
				pendingInitialLeagueInfo: true,
				allKeys,
				keptKeys,
				expandOptions: false,
				challengeNoDraftPicks: false,
				challengeNoFreeAgents: false,
				challengeNoRatings: false,
				challengeNoTrades: false,
				challengeLoseBestPlayer: false,
				challengeFiredLuxuryTax: false,
				challengeFiredMissPlayoffs: false,
				repeatSeason: false,
				noStartingInjuries: false,
				equalizeRegions: false,
				realPlayerDeterminism: 0,
			};
		},
	);

	let title: string;
	if (props.lid !== undefined) {
		title = "Import League";
	} else if (props.type === "custom") {
		title =
			process.env.SPORT === "basketball" ? "New Custom League" : "New League";
	} else if (props.type === "random") {
		title = "New Random Players League";
	} else if (props.type === "legends") {
		title = "New Legends League";
	} else {
		title = "New Real Players League";
	}

	const handleSubmit = useCallback(
		async event => {
			event.preventDefault();

			if (props.lid !== undefined) {
				const result = await confirm(
					`Are you sure you want to import this league? All the data currently in "${props.name}" will be overwritten.`,
					{
						okText: title,
					},
				);
				if (!result) {
					return;
				}
			}

			dispatch({
				type: "submit",
			});

			const actualShuffleRosters = state.keptKeys.includes("players")
				? state.randomization === "shuffle"
				: false;

			const actualDifficulty = state.difficulty;

			const actualStartingSeason =
				state.customize === "default" ? startingSeason : undefined;

			const actualRealPlayerDeterminism =
				(state.customize === "real" || state.customize === "legends") &&
				state.keptKeys.includes("players")
					? state.realPlayerDeterminism
					: undefined;

			try {
				let getLeagueOptions: GetLeagueOptions | undefined;
				if (state.customize === "real") {
					getLeagueOptions = {
						type: "real",
						season: state.season,
						phase: state.phase,
						randomDebuts: state.randomization === "debuts",
					};
				} else if (state.customize === "legends") {
					getLeagueOptions = {
						type: "legends",
						decade: state.legend as any,
					};
				}

				const teamRegionName = getTeamRegionName(state.teams, state.tid);
				safeLocalStorage.setItem("prevTeamRegionName", teamRegionName);
				if (state.customize === "real") {
					safeLocalStorage.setItem("prevSeason", String(state.season));
					safeLocalStorage.setItem("prevPhase", String(state.phase));
				}

				const lid = await toWorker("main", "createLeague", {
					name,
					tid: state.tid,
					leagueFileInput: state.leagueFile,
					keptKeys: state.keptKeys,
					shuffleRosters: actualShuffleRosters,
					difficulty: actualDifficulty,
					importLid: props.lid,
					getLeagueOptions,
					actualStartingSeason,
					challengeNoDraftPicks: state.challengeNoDraftPicks,
					challengeNoFreeAgents: state.challengeNoFreeAgents,
					challengeNoRatings: state.challengeNoRatings,
					challengeNoTrades: state.challengeNoTrades,
					challengeLoseBestPlayer: state.challengeLoseBestPlayer,
					challengeFiredLuxuryTax: state.challengeFiredLuxuryTax,
					challengeFiredMissPlayoffs: state.challengeFiredMissPlayoffs,
					repeatSeason: state.repeatSeason,
					noStartingInjuries: state.noStartingInjuries,
					equalizeRegions: state.equalizeRegions,
					realPlayerDeterminism: actualRealPlayerDeterminism,
					confs: state.confs,
					divs: state.divs,
					teams: state.teams,
				});

				let type: string = state.customize;
				if (type === "real") {
					type = String(state.season);
				}
				if (type === "legends") {
					type = String(state.legend);
				}
				if (window.enableLogging && window.gtag) {
					window.gtag("event", "new_league", {
						event_category: type,
						event_label: teamRegionName,
						value: lid,
					});
				}

				realtimeUpdate([], `/l/${lid}`);
			} catch (err) {
				dispatch({
					type: "error",
				});
				console.log(err);
				logEvent({
					type: "error",
					text: err.message,
					persistent: true,
					saveToDb: false,
				});
			}
		},
		[
			state.challengeNoDraftPicks,
			state.challengeNoFreeAgents,
			state.challengeNoRatings,
			state.challengeNoTrades,
			state.challengeLoseBestPlayer,
			state.challengeFiredLuxuryTax,
			state.challengeFiredMissPlayoffs,
			state.confs,
			state.customize,
			state.difficulty,
			state.divs,
			state.equalizeRegions,
			state.keptKeys,
			state.leagueFile,
			state.legend,
			name,
			props.lid,
			props.name,
			state.noStartingInjuries,
			state.phase,
			state.randomization,
			state.realPlayerDeterminism,
			state.repeatSeason,
			state.season,
			startingSeason,
			state.teams,
			state.tid,
			title,
		],
	);

	const handleNewLeagueFile = useCallback(
		(err, newLeagueFile) => {
			if (err) {
				dispatch({ type: "clearLeagueFile" });
				return;
			}

			let newTeams = helpers.deepCopy(newLeagueFile.teams);
			if (newTeams) {
				for (const t of newTeams) {
					// Is pop hidden in season, like in manageTeams import?
					if (!t.hasOwnProperty("pop") && t.hasOwnProperty("seasons")) {
						t.pop = t.seasons[t.seasons.length - 1].pop;
					}

					// God, I hate being permissive...
					if (typeof t.pop !== "number") {
						t.pop = parseFloat(t.pop);
					}
					if (Number.isNaN(t.pop)) {
						t.pop = 1;
					}

					t.pop = parseFloat(t.pop.toFixed(2));
				}

				newTeams = helpers.addPopRank(newTeams);
			} else {
				newTeams = teamsDefault;
			}

			dispatch({
				type: "newLeagueFile",
				leagueFile: newLeagueFile,
				teams: applyRealTeamInfos(
					newTeams,
					props.realTeamInfo,
					newLeagueFile.startingSeason,
				),
			});

			// Need to update team and difficulty dropdowns?
			if (newLeagueFile.hasOwnProperty("gameAttributes")) {
				for (const ga of newLeagueFile.gameAttributes) {
					if (ga.key === "userTid") {
						let tid = ga.value;
						if (Array.isArray(tid) && tid.length > 0) {
							tid = tid[tid.length - 1].value;
						}
						if (typeof tid === "number" && !Number.isNaN(tid)) {
							dispatch({ type: "setTid", tid });
						}
					} else if (
						ga.key === "difficulty" &&
						typeof ga.value === "number" &&
						!Number.isNaN(ga.value)
					) {
						dispatch({ type: "setDifficulty", difficulty: ga.value });
					}
				}
			}
		},
		[props.realTeamInfo],
	);

	const handleNewLeagueInfo = (leagueInfo: LeagueInfo) => {
		const newTeams = helpers.addPopRank(helpers.deepCopy(leagueInfo.teams));

		dispatch({
			type: "newLeagueInfo",
			allKeys: leagueInfo.stores,
			teams: applyRealTeamInfos(
				newTeams,
				props.realTeamInfo,
				leagueInfo.startingSeason,
			),
			confs: leagueInfo.confs,
			divs: leagueInfo.divs,
		});
	};

	useTitleBar({
		title: customizeTeamsUI ? `${title} » Customize Teams` : title,
		hideNewWindow: true,
	});

	if (customizeTeamsUI) {
		return (
			<CustomizeTeams
				onCancel={() => {
					setCustomizeTeamsUI(false);
				}}
				onSave={({ confs, divs, teams }) => {
					dispatch({
						type: "setTeams",
						confs,
						divs,
						teams: helpers.addPopRank(teams),
					});
					setCustomizeTeamsUI(false);
				}}
				initialConfs={state.confs}
				initialDivs={state.divs}
				initialTeams={state.teams}
				getDefaultConfsDivsTeams={() => {
					return {
						confs: DEFAULT_CONFS,
						divs: DEFAULT_DIVS,
						teams: teamsDefault,
					};
				}}
				godModeLimits={props.godModeLimits}
			/>
		);
	}

	const keptKeysIsAvailable = state.customize.startsWith("custom");
	const displayedTeams =
		!keptKeysIsAvailable || state.keptKeys.includes("teams")
			? state.teams
			: teamsDefault;

	const disableWhileLoadingLeagueFile =
		((state.customize === "custom-rosters" ||
			state.customize === "custom-url") &&
			(state.leagueFile === null || state.loadingLeagueFile)) ||
		((state.customize === "real" || state.customize === "legends") &&
			state.pendingInitialLeagueInfo);
	const showLoadingIndicator =
		disableWhileLoadingLeagueFile &&
		(state.loadingLeagueFile ||
			((state.customize === "real" || state.customize === "legends") &&
				state.pendingInitialLeagueInfo));

	const moreOptions: React.ReactNode[] = [
		<div key="challenge" className="mb-3">
			<label>Challenge modes</label>
			<div className="form-check mb-2">
				<input
					className="form-check-input"
					type="checkbox"
					id="new-league-challengeNoDraftPicks"
					checked={state.challengeNoDraftPicks}
					onChange={() => {
						dispatch({ type: "toggleChallengeNoDraftPicks" });
					}}
				/>
				<label
					className="form-check-label"
					htmlFor="new-league-challengeNoDraftPicks"
				>
					No draft picks
					<br />
					<span className="text-muted">
						{descriptions.challengeNoDraftPicks}
					</span>
				</label>
			</div>
			<div className="form-check mb-2">
				<input
					className="form-check-input"
					type="checkbox"
					id="new-league-challengeNoFreeAgents"
					checked={state.challengeNoFreeAgents}
					onChange={() => {
						dispatch({ type: "toggleChallengeNoFreeAgents" });
					}}
				/>
				<label
					className="form-check-label"
					htmlFor="new-league-challengeNoFreeAgents"
				>
					No free agents
					<br />
					<span className="text-muted">
						{descriptions.challengeNoFreeAgents}
					</span>
				</label>
			</div>
			<div className="form-check mb-2">
				<input
					className="form-check-input"
					type="checkbox"
					id="new-league-challengeNoTrades"
					checked={state.challengeNoTrades}
					onChange={() => {
						dispatch({ type: "toggleChallengeNoTrades" });
					}}
				/>
				<label
					className="form-check-label"
					htmlFor="new-league-challengeNoTrades"
				>
					No trades
				</label>
			</div>
			<div className="form-check mb-2">
				<input
					className="form-check-input"
					type="checkbox"
					id="new-league-challengeNoRatings"
					checked={state.challengeNoRatings}
					onChange={() => {
						dispatch({ type: "toggleChallengeNoRatings" });
					}}
				/>
				<label
					className="form-check-label"
					htmlFor="new-league-challengeNoRatings"
				>
					No visible player ratings
				</label>
			</div>
			<div className="form-check mb-2">
				<input
					className="form-check-input"
					type="checkbox"
					id="new-league-challengeLoseBestPlayer"
					checked={state.challengeLoseBestPlayer}
					onChange={() => {
						dispatch({ type: "toggleChallengeLoseBestPlayer" });
					}}
				/>
				<label
					className="form-check-label"
					htmlFor="new-league-challengeLoseBestPlayer"
				>
					Lose best player every season
					<br />
					<span className="text-muted">
						{descriptions.challengeLoseBestPlayer}
					</span>
				</label>
			</div>
			{process.env.SPORT !== "football" || state.challengeFiredLuxuryTax ? (
				<div className="form-check mb-2">
					<input
						className="form-check-input"
						type="checkbox"
						id="new-league-challengeFiredLuxuryTax"
						checked={state.challengeFiredLuxuryTax}
						onChange={() => {
							dispatch({ type: "toggleChallengeFiredLuxuryTax" });
						}}
					/>
					<label
						className="form-check-label"
						htmlFor="new-league-challengeFiredLuxuryTax"
					>
						You're fired if you pay the luxury tax
					</label>
				</div>
			) : null}
			<div className="form-check mb-2">
				<input
					className="form-check-input"
					type="checkbox"
					id="new-league-challengeFiredMissPlayoffs"
					checked={state.challengeFiredMissPlayoffs}
					onChange={() => {
						dispatch({ type: "toggleChallengeFiredMissPlayoffs" });
					}}
				/>
				<label
					className="form-check-label"
					htmlFor="new-league-challengeFiredMissPlayoffs"
				>
					You're fired if you miss the playoffs
				</label>
			</div>
		</div>,
		<div key="other" className="mb-3">
			<label>Other</label>
			<div className="form-check mb-2">
				<input
					className="form-check-input"
					type="checkbox"
					id="new-league-equalizeRegions"
					checked={state.equalizeRegions}
					onChange={() => {
						dispatch({ type: "toggleEqualizeRegions" });
					}}
				/>
				<label
					className="form-check-label"
					htmlFor="new-league-equalizeRegions"
				>
					Equalize region populations
				</label>
			</div>
			{state.keptKeys.includes("players") ? (
				<div className="form-check mb-2">
					<input
						className="form-check-input"
						type="checkbox"
						id="new-league-noStartingInjuries"
						checked={state.noStartingInjuries}
						onChange={() => {
							dispatch({ type: "toggleNoStartingInjuries" });
						}}
					/>
					<label
						className="form-check-label"
						htmlFor="new-league-noStartingInjuries"
					>
						No starting injuries
					</label>
				</div>
			) : null}
			<div className="form-check mb-2">
				<input
					className="form-check-input"
					type="checkbox"
					id="new-league-repeatSeason"
					checked={state.repeatSeason}
					onChange={() => {
						dispatch({ type: "toggleRepeatSeason" });
					}}
				/>
				<label className="form-check-label" htmlFor="new-league-repeatSeason">
					Groundhog Day
					<br />
					<span className="text-muted">{descriptions.repeatSeason}</span>
				</label>
			</div>
		</div>,
	];

	if (
		(state.customize === "real" || state.customize === "legends") &&
		state.keptKeys.includes("players")
	) {
		moreOptions.unshift(
			<div key="realPlayerDeterminism" className="form-group">
				<label htmlFor="new-league-realPlayerDeterminism">
					Real player development determinism
				</label>
				<div className="d-flex">
					<input
						id="new-league-realPlayerDeterminism"
						type="range"
						className="form-control-range"
						min="0"
						max="1"
						step="0.05"
						value={state.realPlayerDeterminism}
						onChange={event => {
							dispatch({
								type: "setRealPlayerDeterminism",
								realPlayerDeterminism: parseFloat(event.target.value as any),
							});
						}}
					/>
					<div className="text-right" style={{ minWidth: 40 }}>
						{Math.round(state.realPlayerDeterminism * 100)}%
					</div>
				</div>
				<div className="text-muted mt-1">
					{descriptions.realPlayerDeterminism}
				</div>
			</div>,
		);
	}

	if (state.keptKeys.includes("players") || state.customize === "real") {
		moreOptions.unshift(
			<div key="randomization" className="form-group">
				<label htmlFor="new-league-randomization">Randomization</label>
				<select
					id="new-league-randomization"
					className="form-control"
					onChange={event => {
						dispatch({
							type: "setRandomization",
							randomization: event.target.value as any,
						});
					}}
					value={state.randomization}
				>
					<option value="none">None</option>
					{state.customize === "real" ? (
						<option value="debuts">Random debuts</option>
					) : null}
					<option value="shuffle">Shuffle rosters</option>
				</select>
				{state.randomization === "debuts" ? (
					<div className="text-muted mt-1">
						Every player's draft year is randomized. Starting teams and future
						draft classes are all random combinations of past, current, and
						future real players.
					</div>
				) : null}
				{state.randomization === "shuffle" ? (
					<div className="text-muted mt-1">
						All active players are placed on random teams.
					</div>
				) : null}
			</div>,
		);
	}

	const expansionSeasons = [
		1947,
		1948,
		1949,
		1961,
		1966,
		1967,
		1968,
		1970,
		1974,
		1976,
		1980,
		1988,
		1989,
		1995,
		2004,
	];
	let invalidSeasonPhaseMessage: string | undefined;
	if (state.phase > PHASE.PLAYOFFS && expansionSeasons.includes(state.season)) {
		invalidSeasonPhaseMessage =
			"Starting after the playoffs is not yet supported for seasons with expansion drafts.";
	}
	if (state.season === 2021 && state.phase > PHASE.PRESEASON) {
		invalidSeasonPhaseMessage =
			"Sorry, I'm not allowed to share the results of the 2021 season yet.";
	}

	return (
		<form onSubmit={handleSubmit} style={{ maxWidth: 800 }}>
			{props.lid !== undefined ? (
				<>
					<p>
						Here you can create a new league that overwrites one of your
						existing leagues. This is no different than deleting the existing
						league and creating a new one, it's just a little more convenient
						for people who do that a lot.
					</p>
					<p>
						If you just want to create a new league,{" "}
						<a href="/new_league">click here</a>.
					</p>
				</>
			) : null}
			<div className="row">
				<div className="col-sm-6">
					<div className="form-group">
						<label htmlFor="new-league-name">League name</label>
						<input
							id="new-league-name"
							className="form-control"
							type="text"
							value={name}
							onChange={event => {
								setName(event.target.value);
							}}
						/>
					</div>

					{state.customize === "default" ? (
						<div className="form-group">
							<label htmlFor="new-league-starting-season">Season</label>
							<input
								id="new-league-starting-season"
								className="form-control"
								type="text"
								value={startingSeason}
								onChange={event => {
									setStartingSeason(event.target.value);
								}}
							/>
						</div>
					) : null}

					{state.customize === "real" ? (
						<>
							<div className="form-group">
								<LeagueMenu
									value={String(state.season)}
									values={seasons}
									getLeagueInfo={value =>
										toWorker("main", "getLeagueInfo", {
											type: "real",
											season: parseInt(value),
										})
									}
									onLoading={value => {
										const season = parseInt(value);
										dispatch({ type: "setSeason", season });

										if (season === 2021) {
											dispatch({ type: "setPhase", phase: PHASE.PRESEASON });
										}
									}}
									onDone={handleNewLeagueInfo}
									quickValues={["1956", "1968", "1984", "1996", "2003", "2021"]}
									value2={state.phase}
									values2={phases}
									onNewValue2={phase => {
										dispatch({
											type: "setPhase",
											phase,
										});
									}}
								/>
								{invalidSeasonPhaseMessage ? (
									<div className="text-danger mt-1">
										{invalidSeasonPhaseMessage}
									</div>
								) : (
									<div className="text-muted mt-1">
										{state.season} in BBGM is the {state.season - 1}-
										{String(state.season).slice(2)} season.
									</div>
								)}
							</div>
						</>
					) : null}

					{state.customize === "legends" ? (
						<div className="form-group">
							<LeagueMenu
								value={state.legend}
								values={legends}
								getLeagueInfo={value =>
									toWorker("main", "getLeagueInfo", {
										type: "legends",
										decade: value,
									})
								}
								onLoading={legend => {
									dispatch({ type: "setLegend", legend });
								}}
								onDone={handleNewLeagueInfo}
							/>
						</div>
					) : null}

					<div className="form-group">
						<label htmlFor="new-league-team">Pick your team</label>
						<div className="input-group mb-1">
							<select
								id="new-league-team"
								className="form-control"
								disabled={disableWhileLoadingLeagueFile}
								value={state.tid}
								onChange={event => {
									dispatch({
										type: "setTid",
										tid: parseInt(event.target.value),
									});
								}}
							>
								{orderBy(displayedTeams, ["region", "name"]).map(t => {
									return (
										<option key={t.tid} value={t.tid}>
											{showLoadingIndicator
												? "Loading..."
												: `${t.region} ${t.name}`}
										</option>
									);
								})}
							</select>
							{state.customize === "default" ? (
								<div className="input-group-append new-league-customize-teams-wrapper">
									<button
										className="btn btn-secondary"
										disabled={disableWhileLoadingLeagueFile}
										type="button"
										onClick={() => {
											setCustomizeTeamsUI(true);
										}}
									>
										Customize
									</button>
								</div>
							) : null}
							<div className="input-group-append">
								<button
									className="btn btn-secondary"
									disabled={disableWhileLoadingLeagueFile}
									type="button"
									onClick={() => {
										const t =
											displayedTeams[
												Math.floor(Math.random() * displayedTeams.length)
											];
										dispatch({ type: "setTid", tid: t.tid });
									}}
								>
									Random
								</button>
							</div>
						</div>
						{!state.equalizeRegions ? (
							<PopText
								className="text-muted"
								tid={state.tid}
								teams={displayedTeams}
								numActiveTeams={displayedTeams.length}
							/>
						) : (
							<span className="text-muted">
								Region population: equal
								<br />
								Size: normal
							</span>
						)}
					</div>

					<div className="form-group">
						<label htmlFor="new-league-difficulty">Difficulty</label>
						<select
							id="new-league-difficulty"
							className="form-control mb-1"
							onChange={event => {
								dispatch({
									type: "setDifficulty",
									difficulty: event.target.value,
								});
							}}
							value={state.difficulty}
						>
							{Object.entries(DIFFICULTY).map(([text, numeric]) => (
								<option key={numeric} value={numeric}>
									{text}
								</option>
							))}
							{!Object.values(DIFFICULTY).includes(state.difficulty) ? (
								<option value={state.difficulty}>
									Custom (from league file)
								</option>
							) : null}
						</select>
						<span className="text-muted">{descriptions.difficulty}</span>
					</div>

					{moreOptions.length > 0 ? (
						<>
							<button
								className="btn btn-link p-0 mb-3"
								type="button"
								onClick={() => dispatch({ type: "toggleExpandOptions" })}
							>
								<AnimatePresence initial={false}>
									<motion.span
										animate={state.expandOptions ? "open" : "collapsed"}
										variants={{
											open: { rotate: 90 },
											collapsed: { rotate: 0 },
										}}
										transition={{
											duration: 0.3,
											type: "tween",
										}}
										className="glyphicon glyphicon-triangle-right"
									/>
								</AnimatePresence>{" "}
								More options
							</button>
							<AnimatePresence initial={false}>
								{state.expandOptions ? (
									<motion.div
										initial="collapsed"
										animate="open"
										exit="collapsed"
										variants={{
											open: { opacity: 1, height: "auto" },
											collapsed: { opacity: 0, height: 0 },
										}}
										transition={{
											duration: 0.3,
											type: "tween",
										}}
									>
										{moreOptions}
									</motion.div>
								) : null}
							</AnimatePresence>
						</>
					) : null}

					<div className="text-center">
						<button
							type="submit"
							className="btn btn-lg btn-primary mt-3"
							disabled={
								state.creating ||
								disableWhileLoadingLeagueFile ||
								!!invalidSeasonPhaseMessage
							}
						>
							{props.lid !== undefined ? "Import League" : "Create League"}
						</button>
					</div>
				</div>

				{props.type === "custom" ||
				props.type === "real" ||
				props.type === "legends" ? (
					<div
						className={classNames(
							"col-sm-6 order-first order-sm-last mb-3 mb-sm-0",
							{
								"d-none d-sm-block": props.type === "real",
							},
						)}
					>
						<div className="card bg-light mt-1">
							{props.type === "real" ? (
								<>
									<ul className="list-group list-group-flush">
										<li className="list-group-item bg-light">
											<h3>Start in any season back to {MIN_SEASON}</h3>
											<p className="mb-0">
												Players, teams, rosters, and contracts are generated
												from real data. Draft classes are included up to today.
											</p>
										</li>
										<li className="list-group-item bg-light">
											<h3>Watch your league evolve over time</h3>
											<p className="mb-0">
												There were only 11 teams in {MIN_SEASON}, playing a very
												different brand of basketball than today. Live through
												expansion drafts, league rule changes, team relocations,
												economic growth, and changes in style of play.
											</p>
										</li>
										<li className="list-group-item bg-light">
											<h3>Every league is different</h3>
											<p className="mb-0">
												Draft prospects always start the same, but they have
												different career arcs in every league. See busts meet
												their potentials, see injury-shortened careers play out
												in full, and see new combinations of players lead to
												dynasties.
											</p>
										</li>
									</ul>
								</>
							) : null}
							{props.type === "legends" ? (
								<>
									<ul className="list-group list-group-flush">
										<li className="list-group-item bg-light">
											<h3>Legends mode</h3>
											<p>
												Each team is filled with the best players from that
												franchise's history. Create a league with players from
												only one decade, or the greatest players of all time.
											</p>
											<p className="mb-0">
												<a href="https://basketball-gm.com/blog/2020/05/legends-leagues/">
													More details
												</a>
											</p>
										</li>
									</ul>
								</>
							) : null}
							{props.type === "custom" ? (
								<div className="card-body" style={{ marginBottom: "-1rem" }}>
									<h2 className="card-title">Customize</h2>
									<div className="form-group">
										<select
											className="form-control"
											onChange={event => {
												const newCustomize = event.target.value as any;
												dispatch({
													type: "setCustomize",
													customize: newCustomize,
												});
												if (
													newCustomize !== "real" &&
													newCustomize !== "legends"
												) {
													dispatch({ type: "clearLeagueFile" });
												}
											}}
											value={state.customize}
										>
											<option value="default">
												{process.env.SPORT === "basketball"
													? "Random players and teams"
													: "Default"}
											</option>
											{process.env.SPORT === "basketball" ? (
												<option value="real">Real players and teams</option>
											) : null}
											{process.env.SPORT === "basketball" ? (
												<option value="legends">Legends</option>
											) : null}
											<option value="custom-rosters">Upload league file</option>
											<option value="custom-url">Enter league file URL</option>
										</select>
										{state.customize === "custom-rosters" ||
										state.customize === "custom-url" ? (
											<p className="mt-3">
												League files can contain teams, players, settings, and
												other data. You can create a league file by going to
												Tools &gt; Export within a league, or by{" "}
												<a
													href={`https://${process.env.SPORT}-gm.com/manual/customization/`}
												>
													creating a custom league file
												</a>
												.
											</p>
										) : null}
									</div>
									{state.customize === "custom-rosters" ||
									state.customize === "custom-url" ? (
										<div className="my-3">
											<LeagueFileUpload
												onLoading={() => {
													dispatch({ type: "loadingLeagueFile" });
												}}
												onDone={handleNewLeagueFile}
												enterURL={state.customize === "custom-url"}
												hideLoadedMessage
											/>
										</div>
									) : null}

									<LeaguePartPicker
										allKeys={state.allKeys}
										keptKeys={state.keptKeys}
										setKeptKeys={keptKeys => {
											dispatch({ type: "setKeptKeys", keptKeys });
										}}
									/>
								</div>
							) : null}
						</div>
					</div>
				) : null}
			</div>
		</form>
	);
};

NewLeague.propTypes = {
	difficulty: PropTypes.number,
	lid: PropTypes.number,
	name: PropTypes.string.isRequired,
	type: PropTypes.string.isRequired,
};

export default NewLeague;
