from fastapi.testclient import TestClient
from backend.app import app, Inputs, solve, model, pattern
client=TestClient(app)
def test_official_epanet_engine_and_mass_balance():
    s=solve(Inputs())
    assert s["engine"]=="epanet-2.2-WNTR"
    assert s["synthetic"] is True
    assert len(s["nodes"])==6 and len(s["pipes"])==5
    assert s["sourceFlow"]>0
    assert s["quality"]["maxMass"]<0.01
    assert s["totalDelivered"]>0
def test_scenario_hour_demand_varies():
    assert pattern(7)!=pattern(14)
    s1=solve(Inputs(hour=7))
    s2=solve(Inputs(hour=14))
    assert s1["totalDemand"]!=s2["totalDemand"]
def test_export_model_network():
    wn,head,cap,mult,z,lengths=model(Inputs())
    assert len(wn.pipe_name_list)==5
    assert wn.options.hydraulic.demand_model in ("PDD", "PDA")
    assert abs(wn.get_link("P01").diameter-.063)<1e-10
def test_health_and_invalid_input():
    r=client.get('/api/health')
    assert r.status_code==200 and r.json()["fieldValidated"] is False
    bad=client.post('/api/simulate',json={"scenario":"invalid"})
    assert bad.status_code==422
