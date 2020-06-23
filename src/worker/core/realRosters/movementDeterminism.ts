import { g } from "../../util";
import { idb, iterate } from "../../db";
import loadDataBasketball from "./loadData.basketball";
import type { Basketball } from "./loadData.basketball";
import { PLAYER } from "../../../common";
import oldAbbrevTo2020BBGMAbbrev from "./oldAbbrevTo2020BBGMAbbrev";
import type {
	MinimalPlayerRatings,
	Player,
	PlayerWithoutKey,
} from "../../../common/types";

let state: {
	maxSeason: number;
	statsBySeasonSlug: Record<
		number,
		Record<string, Basketball["stats"][number]>
	>;
};

const initState = async () => {
	const basketball = await loadDataBasketball();

	let maxSeason = -Infinity;
	for (const statsRow of basketball.stats) {
		if (statsRow.season > maxSeason) {
			maxSeason = statsRow.season;
		}
	}

	const statsBySeasonSlug: typeof state["statsBySeasonSlug"] = {};

	for (const statsRow of basketball.stats) {
		// Only seasons we care about
		if (!statsBySeasonSlug[statsRow.season]) {
			statsBySeasonSlug[statsRow.season] = {};
		}

		// Only first entry for a player
		if (!statsBySeasonSlug[statsRow.season][statsRow.slug]) {
			statsBySeasonSlug[statsRow.season][statsRow.slug] = statsRow;
		}
	}

	return {
		maxSeason,
		statsBySeasonSlug,
	};
};

const preseason = async () => {
	if (process.env.SPORT !== "basketball") {
		throw new Error(`Not supported for ${process.env.SPORT}`);
	}

	if (!state) {
		state = await initState();
	}

	const season = g.get("season");

	if (season > state.maxSeason) {
		return;
	}

	const statsBySlug = state.statsBySeasonSlug[season];

	if (!statsBySlug) {
		return;
	}

	const tidsByAbbrev: Record<string, number | undefined> = {};
	const teams = await idb.cache.teams.getAll();
	for (const t of teams) {
		if (!t.disabled && t.srID) {
			tidsByAbbrev[oldAbbrevTo2020BBGMAbbrev(t.srID)] = t.tid;
		}
	}
	console.log(season);

	const cachedPlayers = await idb.cache.players.getAll();
	const missingPlayers = new Set(Object.keys(statsBySlug));

	for (const p of cachedPlayers) {
		if (p.srID) {
			missingPlayers.delete(p.srID);
		}

		const stats = p.srID ? statsBySlug[p.srID] : undefined;
		if (!stats) {
			if (p.srID) {
				// Must have sat out this year
				p.tid = PLAYER.RETIRED;
			} else if (p.tid >= 0) {
				// Move random players to FA
				p.tid = PLAYER.FREE_AGENT;
			}
			await idb.cache.players.put(p);
			continue;
		}

		const tid = tidsByAbbrev[stats.abbrev];
		if (tid !== undefined) {
			p.tid = tid;
		} else {
			console.log(
				`No tid found for ${p.firstName} ${p.lastName} (target abbrev: ${stats.abbrev})`,
			);
		}
		await idb.cache.players.put(p);
	}

	console.log("missingPlayers.size A", missingPlayers.size);

	if (missingPlayers.size > 0) {
		const promises: Promise<any>[] = [];

		// Look for retired players that need to be un-retired
		const transaction = idb.league.transaction("players", "readwrite");
		await iterate(transaction.store, undefined, "prev", p => {
			if (p.srID && missingPlayers.has(p.srID)) {
				const stats = statsBySlug[p.srID];
				if (!stats) {
					return;
				}

				const tid = tidsByAbbrev[stats.abbrev];
				if (tid !== undefined) {
					console.log(
						`Unretire ${p.firstName} ${p.lastName} (${stats.abbrev})`,
					);
					p.tid = tid;
				} else {
					console.log(
						`2 No tid found for ${p.firstName} ${p.lastName} (target abbrev: ${stats.abbrev})`,
					);
				}

				missingPlayers.delete(p.srID);

				promises.push(idb.cache.players.put(p));
				missingPlayers.delete(p.srID);
			}
		});

		await Promise.all(promises);
	}

	console.log("missingPlayers.size B", missingPlayers.size);

	// Create missing player that somehow is not in database already, like if you start a league while a player is tempoararily retired
	for (const srID of missingPlayers) {
		console.log("MISSING PLAYER NEED TO CREATE", srID);
	}
};

// undefined means not sure, so normal shouldRetire should be used
const shouldRetire = async (
	p: Player<MinimalPlayerRatings> | PlayerWithoutKey<MinimalPlayerRatings>,
): Promise<boolean | undefined> => {
	console.log("shouldRetire", p.firstName, p.lastName);
	if (!state) {
		state = await initState();
	}

	if (g.get("season") >= state.maxSeason || !p.srID) {
		return;
	}

	// Entry in stats for this player next season? It not, retire

	const statsBySlug = state.statsBySeasonSlug[g.get("season") + 1];

	if (!statsBySlug) {
		return;
	}

	return !statsBySlug[p.srID];
};

export default {
	preseason,
	shouldRetire,
};