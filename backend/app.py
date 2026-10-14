"""Official EPANET 2.2 engine through USEPA WNTR.
Only synthetic demonstration assets; NOT field-validated.
The source capacity constraint is checked as a post-simulation feasibility
condition, not silently enforced via fictitious flow controls.
"""
from __future__ import annotations
import copy
import math
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import wntr

app = FastAPI(title="Vietflexmap DigitalTwin — EPANET/WNTR API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://vietflexmap.github.io", "http://localhost:8000",
                   "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"], allow_headers=["*"],
)
NODES = [
    dict(id="SRC",name="Nguồn giả định",lon=103.8890,lat=21.3325,z=927.,demand=0.,households=0),
    dict(id="J1",name="Nút phân phối",lon=103.8920,lat=21.3288,z=912.,demand=0.,households=0),
    dict(id="H1",name="Cụm dân cư A",lon=103.8961,lat=21.3265,z=903.,demand=.38,households=42),
    dict(id="H2",name="Cụm dân cư B",lon=103.8866,lat=21.3254,z=909.,demand=.33,households=37),
    dict(id="H3",name="Cụm dân cư C",lon=103.8998,lat=21.3217,z=895.,demand=.42,households=48),
    dict(id="H4",name="Cụm dân cư D",lon=103.8842,lat=21.3208,z=897.,demand=.36,households=41),
]
PIPES = [
    dict(id="P01",a=0,b=1,length=510.),
    dict(id="P12",a=1,b=2,length=490.),
    dict(id="P13",a=1,b=3,length=525.),
    dict(id="P24",a=2,b=4,length=440.),
    dict(id="P35",a=3,b=5,length=535.),
]
ROUTES = {
    "A": dict(length=[.87,.91,.92,.93,.9],trench=[1.23,1.24,1.23,1.25,1.22]),
    "B": dict(length=[1.,1.,1.,1.,1.],trench=[1.,1.,1.,1.,1.]),
    "C": dict(length=[1.16,1.18,1.20,1.19,1.13],trench=[.84,.80,.79,.83,.82]),
}
SCENARIOS = {
    "dry": dict(head=0.,capacity=1.,demand=1.),
    "wet": dict(head=3.,capacity=1.3,demand=1.),
    "drought": dict(head=-8.,capacity=.62,demand=1.07),
    "peak": dict(head=-1.,capacity=1.,demand=1.42),
}
COST = {25:31000,32:39000,40:53000,50:72000,63:105000,75:147000,90:200000}
class Inputs(BaseModel):
    scenario: str = "dry"
    route: str = "B"
    hour: int = Field(default=10, ge=0, le=23)
    head: float = Field(default=942, ge=-500, le=7000)
    capacity: float = Field(default=2.0, ge=.01, le=100)
    roughness: float = Field(default=130, ge=70, le=160)
    demand: float = Field(default=1.0, ge=.1, le=5)
    diameters: list[int] = Field(default_factory=lambda: [63,50,50,40,40], min_length=5, max_length=5)
    elevationOverride: Optional[dict[str, float]] = None

def check(a: Inputs):
    if a.scenario not in SCENARIOS: raise ValueError("Invalid scenario")
    if a.route not in ROUTES: raise ValueError("Invalid route")
    if any(d not in COST for d in a.diameters): raise ValueError("Unsupported diameter")
    if a.elevationOverride is not None:
        if any(k not in {n["id"] for n in NODES} for k in a.elevationOverride):
            raise ValueError("Unknown elevation node")
        if any(not math.isfinite(v) or not -500<=v<=7000 for v in a.elevationOverride.values()):
            raise ValueError("Invalid elevations")

def pattern(hour: int) -> float:
    return (.66 + .45*math.exp(-((hour-7.5)/2.4)**2)
            + .46*math.exp(-((hour-19.)/2.7)**2))

def conditions(a: Inputs):
    s = SCENARIOS[a.scenario]
    return (a.head+s["head"], a.capacity*s["capacity"],
            a.demand*s["demand"]*pattern(a.hour))

def model(a: Inputs):
    check(a)
    H, cap, multiplier = conditions(a)
    z = {n["id"]: float(a.elevationOverride.get(n["id"], n["z"])
                          if a.elevationOverride else n["z"]) for n in NODES}
    wn = wntr.network.WaterNetworkModel()
    wn.add_reservoir("SRC", base_head=H, coordinates=(NODES[0]["lon"],NODES[0]["lat"]))
    for n in NODES[1:]:
        wn.add_junction(n["id"], base_demand=n["demand"]*multiplier/1000.,
                        elevation=z[n["id"]], coordinates=(n["lon"],n["lat"]))
    lengths=[]
    for i,p in enumerate(PIPES):
        le=p["length"]*ROUTES[a.route]["length"][i]
        lengths.append(le)
        wn.add_pipe(p["id"], NODES[p["a"]]["id"],NODES[p["b"]]["id"],
                    length=le,diameter=a.diameters[i]/1000.,roughness=a.roughness,
                    minor_loss=0,initial_status="OPEN")
    wn.options.hydraulic.headloss="H-W"
    wn.options.hydraulic.demand_model="PDD"
    wn.options.hydraulic.minimum_pressure=0.
    wn.options.hydraulic.required_pressure=15.
    wn.options.time.duration=0
    return wn, H, cap, multiplier, z, lengths

def price(a: Inputs):
    return sum(p["length"]*ROUTES[a.route]["length"][i]*
               ROUTES[a.route]["trench"][i]*COST[a.diameters[i]]
               for i,p in enumerate(PIPES))/1e6

def headloss(length: float, q_lps: float, d_mm: float, rough: float):
    return (10.67 * length * (abs(q_lps)/1000)**1.852
            / (rough**1.852 * (d_mm/1000)**4.871)) if abs(q_lps)>1e-12 else 0.

def solve(a: Inputs):
    wn,H,cap,mult,z,lengths=model(a)
    try:
        sim=wntr.sim.EpanetSimulator(wn)
        result=sim.run_sim(version=2.2)
        if result is None or not hasattr(result, "node"): raise ValueError("No EPANET solution")
        head=result.node["head"].iloc[0]
        pressure=result.node["pressure"].iloc[0]
        demands=result.node["demand"].iloc[0]
        flows=result.link["flowrate"].iloc[0]
    except Exception as e:
        raise RuntimeError("EPANET 2.2 did not produce a converged result: "+str(e)) from e
    nodes=[]
    for n in NODES:
        k=n["id"]
        nodes.append({**n,"z":z[k],"head":float(head[k]),"pressure":float(pressure[k]),
                      "requested":n["demand"]*mult,
                      "delivered":max(0.,float(demands[k])*1000.) if k!="SRC" else 0.})
    pipes=[]
    for i,p in enumerate(PIPES):
        q=float(flows[p["id"]])*1000.
        d=a.diameters[i];area=math.pi*(d/1000.)**2/4.
        lossval=headloss(lengths[i],q,d,a.roughness)
        pipes.append({**p,"len":p["length"],"length":lengths[i],
                      "flow":q,"diameter":d,"loss":lossval,
                      "velocity":abs(q/1000.)/area})
    delivered=sum(n["delivered"] for n in nodes)
    requested=sum(n["requested"] for n in nodes)
    flow_source=pipes[0]["flow"]
    mass=[]
    for i,n in enumerate(NODES):
        if i==0:continue
        enter=sum(p["flow"] for p in pipes if p["b"]==i)
        leave=sum(p["flow"] for p in pipes if p["a"]==i)
        mass.append(abs(enter-leave-nodes[i]["delivered"]))
    # Hazen-Williams constant can differ slightly from engine coefficients.
    residual_energy=[abs(nodes[p["a"]]["head"]-nodes[p["b"]]["head"]-p["loss"]) for p in pipes]
    mass_error=max(mass)
    energy_error=max(residual_energy)
    cap_violation=max(0.,flow_source-cap)
    pressure_vals=[n["pressure"] for n in nodes[2:]]
    min_p=min(pressure_vals);max_p=max(pressure_vals)
    coverage=delivered/requested if requested>0 else 1.
    converged=math.isfinite(flow_source) and all(math.isfinite(n["head"]) for n in nodes)
    physics_pass=bool(converged and mass_error<1e-5 and energy_error<.3 and cap_violation<1e-6)
    service_pass=bool(physics_pass and coverage>=.95 and min_p>=15 and max_p<=60
                      and max(p["velocity"] for p in pipes)<=2)
    return {"engine":"epanet-2.2-WNTR","synthetic":True,
      "scenario":a.scenario,"hour":a.hour,
      "sourceFlow":flow_source,"totalDemand":requested,
      "totalDelivered":delivered,"coverage":coverage,"minP":min_p,"maxP":max_p,
      "cost":price(a),"nodes":nodes,"pipes":pipes,
      "quality":{"maxMass":mass_error,"maxEnergy":energy_error,"physicsPass":physics_pass,
        "servicePass":service_pass,"converged":converged,"iterations":None,
        "capacityRationing":False,"sourceLimitViolated":cap_violation>1e-6,
        "capacityExcessLps":cap_violation,
        "warning":("EPANET reservoir does not enforce seasonal source capacity; "
                   "excess supply is a physical feasibility failure, not silently rationed.")}}

@app.get("/api/health")
def health():
    return {"status":"ok","engine":"EPANET 2.2 via WNTR",
            "data":"synthetic","fieldValidated":False}

@app.post("/api/simulate")
def simulate(a: Inputs):
    try: return solve(a)
    except (ValueError,RuntimeError) as e: raise HTTPException(status_code=422,detail=str(e))

@app.post("/api/day")
def day(a: Inputs):
    try:
        return {"engine":"epanet-2.2-WNTR","series":[solve(a.model_copy(update={"hour":h})) for h in range(24)]}
    except (ValueError,RuntimeError) as e: raise HTTPException(status_code=422,detail=str(e))

def objective(sim, dry):
    deficit=max(0.,1.-.55*sim["coverage"]-.45*dry["coverage"])
    def risk(s):
        return (sum(max(0.,15-n["pressure"])+.4*max(0.,n["pressure"]-60)
                    for n in s["nodes"][2:])+
                max(0.,max(p["velocity"] for p in s["pipes"])-2)*10)
    return [sim["cost"], deficit*100, max(risk(sim),risk(dry))]

def dominates(a, b):
    return all(x<=y+1e-7 for x,y in zip(a,b)) and any(x<y-1e-7 for x,y in zip(a,b))

@app.post("/api/optimize")
def optimize(a: Inputs):
    """Bounded NSGA-II discrete search; evaluations use real WNTR EpanetSimulator.
    This is a research demonstrator, not a guarantee of global optimality.
    """
    try:
        from pymoo.core.problem import ElementwiseProblem
        from pymoo.algorithms.moo.nsga2 import NSGA2
        from pymoo.optimize import minimize
        from pymoo.termination import get_termination
        import numpy as np
        check(a)
        variants=["A","B","C"]
        trunk=[50,63,75,90];mid=[32,40,50,63];tail=[25,32,40,50]
        evaluated={}
        def assessment(x):
            code=tuple(int(max(0,min(hi,round(float(v))))) for v,hi in zip(x,[2,3,3,3]))
            if code in evaluated:return evaluated[code]
            opts=a.model_copy(update={
                "route":variants[code[0]],
                "diameters":[trunk[code[1]],mid[code[2]],mid[code[2]],tail[code[3]],tail[code[3]]]})
            try:
                s=solve(opts);dry=solve(opts.model_copy(update={"scenario":"drought"}))
                f=objective(s,dry);feasible=s["quality"]["physicsPass"] and dry["quality"]["physicsPass"]
            except (RuntimeError,ValueError):
                f=[1e9,1e4,1e4];feasible=False
            row={"id":"OPT-"+str(len(evaluated)+1),"route":opts.route,
                 "diameters":opts.diameters,"cost":f[0],"deficit":f[1]/100,
                 "risk":f[2],"feasible":feasible,"f":f}
            evaluated[code]=row;return row
        class DiscreteTwin(ElementwiseProblem):
            def __init__(self):
                super().__init__(n_var=4,n_obj=3,n_ieq_constr=1,
                                 xl=np.array([0,0,0,0]),xu=np.array([2,3,3,3]))
            def _evaluate(self,x,out,*args,**kwargs):
                row=assessment(x)
                out["F"]=row["f"]
                out["G"]=[0 if row["feasible"] else 1]
        minimize(DiscreteTwin(),NSGA2(pop_size=28),get_termination("n_gen",8),
                 seed=2026,verbose=False)
        valid=[r for r in evaluated.values() if r["feasible"]]
        frontier=[r for r in valid if not any(
            s is not r and dominates(s["f"],r["f"]) for s in valid)]
        if frontier:
            spans=[(min(r["f"][j] for r in frontier),
                    max(r["f"][j] for r in frontier)) for j in range(3)]
            for r in frontier:
                r["score"]=sum(w*(r["f"][j]-mi)/max(1e-7,ma-mi)
                    for j,(mi,ma),w in zip(range(3),spans,[.4,.4,.2]))
        frontier.sort(key=lambda r:r.get("score",r["cost"]))
        return {"engine":"epanet-2.2-WNTR-NSGA-II","evaluated":len(evaluated),
                "feasible":len(valid),"allCount":len(frontier),
                "frontier":frontier[:40],"best":frontier[0] if frontier else None,
                "objectives":["cost_MVND","unmet_weighted_pct","pressure_risk"],
                "globalOptimalityProven":False}
    except (ValueError,RuntimeError) as e:
        raise HTTPException(status_code=422,detail=str(e))
