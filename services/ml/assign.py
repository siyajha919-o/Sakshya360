"""Random inspection assignment with OR-Tools CP-SAT.

Hard constraints
  * each selected project gets exactly one inspector, exactly `count` projects are selected
  * an inspector's new duties <= remaining capacity
  * no inspector from the project's home state (conflict of interest)
  * no inspector who inspected the same project before (rotation)
Objective
  maximise  sum(priority_p * x_pi) - distance penalty
  where priority_p = risk + neglect bonus + a seeded random draw. The random term makes
  assignments unpredictable to NGOs, while high-risk sites are still visited more often.
"""
import random

from ortools.sat.python import cp_model


def optimise(projects, inspectors, distance_km, count, seed, randomness=40, km_weight=0.02, time_limit_s=10.0):
    rng = random.Random(seed)
    km = {(d["inspector_id"], d["project_id"]): d["km"] for d in distance_km}

    priority = {}
    for p in projects:
        neglect = min(p.get("days_since_inspection", 0), 180) / 6          # up to +30
        priority[p["id"]] = p["risk"] + neglect + rng.uniform(0, randomness)

    model = cp_model.CpModel()
    x, excluded = {}, []
    for p in projects:
        for i in inspectors:
            reasons = []
            if i["home_state"] == p["state"]:
                reasons.append("home state")
            if p["id"] in i.get("visited", []):
                reasons.append("inspected before")
            if i["capacity"] <= 0:
                reasons.append("no capacity")
            if reasons:
                excluded.append({"project_id": p["id"], "inspector_id": i["id"], "reasons": reasons})
                continue
            x[p["id"], i["id"]] = model.NewBoolVar(f"x_{p['id']}_{i['id']}")

    for p in projects:
        vars_p = [v for (pid, _), v in x.items() if pid == p["id"]]
        if vars_p:
            model.Add(sum(vars_p) <= 1)
    for i in inspectors:
        vars_i = [v for (_, iid), v in x.items() if iid == i["id"]]
        if vars_i:
            model.Add(sum(vars_i) <= i["capacity"])

    feasible_projects = len({pid for pid, _ in x})
    target = min(count, feasible_projects, sum(max(0, i["capacity"]) for i in inspectors))
    model.Add(sum(x.values()) == target)

    # CP-SAT needs integer coefficients.
    model.Maximize(sum(v * int(round((priority[pid] - km_weight * km.get((iid, pid), 1000)) * 100)) for (pid, iid), v in x.items()))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.random_seed = seed % (2 ** 31)
    solver.parameters.num_workers = 1  # deterministic for a given seed (auditable replay)
    status = solver.Solve(model)

    assignments = []
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for (pid, iid), v in x.items():
            if solver.Value(v):
                assignments.append({
                    "project_id": pid, "inspector_id": iid, "km": km.get((iid, pid)),
                    "priority": round(priority[pid], 2),
                    "reason": f"priority {priority[pid]:.1f} (risk + neglect + random), {km.get((iid, pid), '?')} km",
                })
    return {
        "status": solver.StatusName(status),
        "objective": solver.ObjectiveValue() / 100 if assignments else None,
        "requested": count,
        "assigned": len(assignments),
        "assignments": sorted(assignments, key=lambda a: -a["priority"]),
        "priorities": {k: round(v, 2) for k, v in sorted(priority.items(), key=lambda kv: -kv[1])},
        "excluded_pairs": excluded,
        "seed": seed,
    }
