import type { IntraopSheetsHostProps } from "@/components/intraop/IntraopSheetsHost"
import { canStartDrugAsInfusion } from "@/lib/intraop-library"
import type { ActiveGasSettings } from "@/lib/intraop-log-event"
import { pediatricAgeFromPreop, type IntraopPreopSummary } from "@/lib/intraop-preop-summary"

type MedicationSheetProps = Pick<
  IntraopSheetsHostProps,
  "gas" | "drug" | "vitals" | "infusion" | "infusionAction" | "fluid" | "fluidEnd" | "agent"
>

type GasProps = MedicationSheetProps["gas"]
type DrugProps = MedicationSheetProps["drug"]
type VitalsProps = MedicationSheetProps["vitals"]
type InfusionProps = MedicationSheetProps["infusion"]
type InfusionActionProps = MedicationSheetProps["infusionAction"]
type FluidProps = MedicationSheetProps["fluid"]
type FluidEndProps = MedicationSheetProps["fluidEnd"]
type AgentProps = MedicationSheetProps["agent"]

export type IntraopMedicationSheetBuilderProps = {
  activeAgent: AgentProps["activeAgent"]
  activeGas: ActiveGasSettings
  gasOpen: GasProps["visible"]
  gasFgf: GasProps["fgf"]
  setGasOpen: (open: boolean) => void
  setGasFgf: GasProps["onFgfChange"]
  gasCarrierGas: GasProps["carrierGas"]
  setGasCarrierGas: GasProps["onCarrierGasChange"]
  gasFio2: GasProps["fio2"]
  setGasFio2: GasProps["onFio2Change"]
  confirmGasSettings: GasProps["onConfirm"]
  drugOpen: DrugProps["visible"]
  setDrugOpen: (open: boolean) => void
  DRUG_CATS: DrugProps["drugCats"]
  favouriteDrugs: DrugProps["favouriteNames"]
  BOLUS_SCENARIOS: DrugProps["scenarios"]
  drugCat: DrugProps["drugCat"]
  setDrugCat: DrugProps["setDrugCat"]
  drugPick: DrugProps["drugPick"]
  setDrugPick: DrugProps["setDrugPick"]
  drugDose: DrugProps["drugDose"]
  setDrugDose: DrugProps["setDrugDose"]
  DRUG_QUICK_DOSES: DrugProps["dosePresets"]
  DRUG_RANGES: DrugProps["ranges"]
  INF_DRUGS: InfusionProps["infDrugs"]
  confirmDrug: DrugProps["onConfirm"]
  startDrugAsInfusion: DrugProps["onStartAsInfusion"]
  DRUG_ROUTES: DrugProps["routes"]
  drugRoute: DrugProps["drugRoute"]
  setDrugRoute: DrugProps["setDrugRoute"]
  DRUG_LA_CONCENTRATIONS: DrugProps["laConcentrations"]
  drugConcentration: DrugProps["drugConcentration"]
  setDrugConcentration: DrugProps["setDrugConcentration"]
  drugCustomConcentration: DrugProps["drugCustomConcentration"]
  setDrugCustomConcentration: DrugProps["setDrugCustomConcentration"]
  drugFormulation: DrugProps["drugFormulation"]
  setDrugFormulation: DrugProps["setDrugFormulation"]
  drugRule: DrugProps["drugRule"]
  applyDrugSelection: DrugProps["applyDrugSelection"]
  DRUG_BASE_PROFILES: DrugProps["baseProfiles"]
  DRUG_ROUTE_PROFILES: DrugProps["routeProfiles"]
  DRUG_DOSE_CALCS: DrugProps["doseCalcs"]
  preop: IntraopPreopSummary | null
  pediatricDrugProfiles: DrugProps["pediatricDrugProfiles"]
  pediatricFluidProfiles: FluidProps["pediatricFluidProfiles"]
  pediatricInfusionProfiles: InfusionProps["pediatricInfusionProfiles"]
  pediatricDoseProfiles: DrugProps["pediatricDoseProfiles"]
  pediatricRulesSource: DrugProps["pediatricRulesSource"]
  pediatricRulesCachedAt: DrugProps["pediatricRulesCachedAt"]
  pediatricRulesLoading: DrugProps["pediatricRulesLoading"]
  pediatricRulesError: DrugProps["pediatricRulesError"]
  vitOpen: VitalsProps["visible"]
  vitMode: VitalsProps["mode"]
  editingVitalId: string | null
  vitScanBusy: VitalsProps["scanBusy"]
  vitalVisibility: {
    showEtco2: boolean
    showTemperature: boolean
    showGlucose: boolean
  }
  etco2Unit: VitalsProps["etco2Unit"]
  temperatureUnit: VitalsProps["temperatureUnit"]
  vSysRef: VitalsProps["sysRef"]
  vDiaRef: VitalsProps["diaRef"]
  vHRRef: VitalsProps["hrRef"]
  vSpO2Ref: VitalsProps["spo2Ref"]
  vEtco2Ref: VitalsProps["etco2Ref"]
  vTempRef: VitalsProps["tempRef"]
  vBglRef: VitalsProps["glucoseRef"]
  vSys: VitalsProps["systolic"]
  vDia: VitalsProps["diastolic"]
  vHR: VitalsProps["heartRate"]
  vSpO2: VitalsProps["spo2"]
  vEtco2: VitalsProps["etco2"]
  vTemp: VitalsProps["temperature"]
  vBgl: VitalsProps["glucose"]
  setVitOpen: (open: boolean) => void
  setEditingVitalId: (id: string | null) => void
  scanVitalsFromCamera: VitalsProps["onScan"]
  setAndAdvance: (
    value: string,
    setter: (next: string) => void,
    nextRef?: VitalsProps["diaRef"],
    maxLength?: number,
  ) => void
  setVSys: VitalsProps["onSystolicChange"]
  setVDia: VitalsProps["onDiastolicChange"]
  setVHR: VitalsProps["onHeartRateChange"]
  setVSpO2: VitalsProps["onSpo2Change"]
  setVEtco2: VitalsProps["onEtco2Change"]
  setVTemp: VitalsProps["onTemperatureChange"]
  setVBgl: VitalsProps["onGlucoseChange"]
  confirmVitals: VitalsProps["onConfirm"]
  infOpen: InfusionProps["visible"]
  setInfOpen: (open: boolean) => void
  setInfDrug: InfusionProps["setInfDrug"]
  setInfRate: InfusionProps["setInfRate"]
  setInfRoute: (route: string | undefined) => void
  setInfConcentration: (concentration: string | undefined) => void
  setInfCustomConcentration: InfusionProps["setInfCustomConcentration"]
  setInfFormulation: InfusionProps["setInfFormulation"]
  setInfRule: InfusionProps["setInfRule"]
  INFUSION_SCENARIOS: InfusionProps["scenarios"]
  INFUSION_QUICK_RATES: InfusionProps["ratePresets"]
  INFUSION_ROUTES: InfusionProps["routes"]
  INFUSION_LA_CONCENTRATIONS: InfusionProps["laConcentrations"]
  INFUSION_RANGES: InfusionProps["ranges"]
  INFUSION_SUGGESTED_RATES: InfusionProps["suggestedRates"]
  INFUSION_BASE_PROFILES: InfusionProps["baseProfiles"]
  INFUSION_ROUTE_PROFILES: InfusionProps["routeProfiles"]
  favouriteInfusions: InfusionProps["favouriteNames"]
  infDrug: InfusionProps["infDrug"]
  infRate: InfusionProps["infRate"]
  confirmInfusion: InfusionProps["onConfirm"]
  infRoute: InfusionProps["infRoute"]
  infConcentration: InfusionProps["infConcentration"]
  infCustomConcentration: InfusionProps["infCustomConcentration"]
  infFormulation: InfusionProps["infFormulation"]
  infRule: InfusionProps["infRule"]
  infActOpen: InfusionActionProps["visible"]
  setInfActOpen: (open: boolean) => void
  infActTgt: InfusionActionProps["target"]
  setInfActTgt: (target: InfusionActionProps["target"]) => void
  infActRate: InfusionActionProps["newRate"]
  setInfActRate: InfusionActionProps["setNewRate"]
  changeRate: InfusionActionProps["onChangeRate"]
  stopInfusion: InfusionActionProps["onStop"]
  infActConcentration: InfusionActionProps["newConcentration"]
  setInfActConcentration: (concentration: string | undefined) => void
  flOpen: FluidProps["visible"]
  setFlOpen: (open: boolean) => void
  setFlFluid: (fluid: FluidProps["flFluid"]) => void
  setFlVol: FluidProps["setFlVol"]
  setFlConcentration: (concentration: string | undefined) => void
  FLUID_LIST: FluidProps["fluidList"]
  flFluid: FluidProps["flFluid"]
  flVol: FluidProps["flVol"]
  flEntryMode: FluidProps["flEntryMode"]
  setFlEntryMode: FluidProps["setFlEntryMode"]
  flRate: FluidProps["flRate"]
  setFlRate: FluidProps["setFlRate"]
  resetFluidDraft: () => void
  confirmFluid: FluidProps["onConfirm"]
  FLUID_QUICK_VOLUMES: FluidProps["quickVolumes"]
  FLUID_CONCENTRATIONS: FluidProps["concentrations"]
  FLUID_DEFAULT_CONCENTRATIONS: FluidProps["defaultConcentrations"]
  flConcentration: FluidProps["flConcentration"]
  flRoute: FluidProps["flRoute"]
  setFlRoute: NonNullable<FluidProps["setFlRoute"]>
  setFlRule: NonNullable<FluidProps["setFlRule"]>
  flEndOpen: FluidEndProps["visible"]
  setFlEndOpen: (open: boolean) => void
  flEndTarget: FluidEndProps["target"]
  flEndCustom: FluidEndProps["customAmount"]
  setFlEndCustom: FluidEndProps["setCustomAmount"]
  flEndRate: FluidEndProps["newRate"]
  setFlEndRate: FluidEndProps["setNewRate"]
  changeFluidRate: FluidEndProps["onChangeRate"]
  confirmFluidEnd: FluidEndProps["onConfirm"]
  agOpen: AgentProps["visible"]
  setAgOpen: (open: boolean) => void
  setAgPick: (agent: AgentProps["agPick"]) => void
  setAgPercent: (percent: number | null) => void
  VOLATILE_AGENTS: AgentProps["agents"]
  agPick: AgentProps["agPick"]
  confirmAgent: AgentProps["onConfirm"]
  AGENT_QUICK_PERCENTS: AgentProps["quickPercents"]
  agPercent: AgentProps["agPercent"]
}

export function buildIntraopMedicationSheetProps(props: IntraopMedicationSheetBuilderProps): MedicationSheetProps {
  const {
    activeAgent, activeGas, gasOpen, gasFgf, setGasOpen, setGasFgf, gasCarrierGas,
    setGasCarrierGas, gasFio2, setGasFio2, confirmGasSettings, drugOpen, setDrugOpen,
    DRUG_CATS, favouriteDrugs, BOLUS_SCENARIOS, drugCat, setDrugCat, drugPick,
    setDrugPick, drugDose, setDrugDose, DRUG_QUICK_DOSES, DRUG_RANGES, INF_DRUGS,
    confirmDrug, startDrugAsInfusion, DRUG_ROUTES, drugRoute, setDrugRoute,
    DRUG_LA_CONCENTRATIONS, drugConcentration, setDrugConcentration,
    drugCustomConcentration, setDrugCustomConcentration, drugFormulation, setDrugFormulation,
    drugRule, applyDrugSelection, DRUG_BASE_PROFILES,
    DRUG_ROUTE_PROFILES, DRUG_DOSE_CALCS, preop, pediatricDrugProfiles, pediatricFluidProfiles,
    pediatricInfusionProfiles,
    pediatricDoseProfiles,
    pediatricRulesSource, pediatricRulesCachedAt, pediatricRulesLoading, pediatricRulesError,
    vitOpen, vitMode, editingVitalId,
    vitScanBusy, vitalVisibility, etco2Unit, temperatureUnit, vSysRef, vDiaRef, vHRRef,
    vSpO2Ref, vEtco2Ref, vTempRef, vBglRef, vSys, vDia, vHR, vSpO2, vEtco2, vTemp,
    vBgl, setVitOpen, setEditingVitalId, scanVitalsFromCamera, setAndAdvance, setVSys,
    setVDia, setVHR, setVSpO2, setVEtco2, setVTemp, setVBgl, confirmVitals, infOpen,
    setInfOpen, setInfDrug, setInfRate, setInfRoute, setInfConcentration,
    setInfCustomConcentration, setInfFormulation, setInfRule,
    INFUSION_SCENARIOS, INFUSION_QUICK_RATES, INFUSION_ROUTES, INFUSION_LA_CONCENTRATIONS,
    INFUSION_RANGES, INFUSION_SUGGESTED_RATES, INFUSION_BASE_PROFILES,
    INFUSION_ROUTE_PROFILES, favouriteInfusions, infDrug, infRate, confirmInfusion,
    infRoute, infConcentration, infCustomConcentration, infFormulation, infRule,
    infActOpen, setInfActOpen, infActTgt, setInfActTgt,
    infActRate, setInfActRate, changeRate, stopInfusion, infActConcentration,
    setInfActConcentration, flOpen, setFlOpen, setFlFluid, setFlVol, setFlConcentration,
    FLUID_LIST, flFluid, flVol, flEntryMode, setFlEntryMode, flRate, setFlRate,
    resetFluidDraft, confirmFluid, FLUID_QUICK_VOLUMES, FLUID_CONCENTRATIONS,
    FLUID_DEFAULT_CONCENTRATIONS, flConcentration, flRoute, setFlRoute, setFlRule,
    flEndOpen, setFlEndOpen, flEndTarget,
    flEndCustom, setFlEndCustom, flEndRate, setFlEndRate, changeFluidRate,
    confirmFluidEnd, agOpen, setAgOpen, setAgPick,
    setAgPercent, VOLATILE_AGENTS, agPick, confirmAgent, AGENT_QUICK_PERCENTS, agPercent,
  } = props
  const pediatricMode = preop?.clinicalMode === "PEDIATRIC"

  return {
    gas: {
      visible: gasOpen,
      isEditing: !!activeGas,
      fgf: gasFgf,
      carrierGas: gasCarrierGas,
      fio2: gasFio2,
      onClose: () => setGasOpen(false),
      onFgfChange: setGasFgf,
      onCarrierGasChange: setGasCarrierGas,
      onFio2Change: setGasFio2,
      onConfirm: confirmGasSettings,
      pediatricMode,
    },
    drug: {
      visible: drugOpen,
      onClose: () => setDrugOpen(false),
      drugCats: DRUG_CATS,
      favouriteNames: favouriteDrugs,
      // Scenario groups are navigation, not dosing: the pills carry a drug name
      // and its unit, and selecting one goes through the same paediatric profile
      // path as any other route into the sheet. Emptying them in paediatric mode
      // left that menu with only Favourites and Browse all, so a paediatric case
      // had no way to reach drugs by scenario. The adult dose presets stay
      // suppressed below, which is what actually had to be kept apart.
      scenarios: BOLUS_SCENARIOS,
      drugCat,
      setDrugCat,
      drugPick,
      setDrugPick,
      drugDose,
      setDrugDose,
      dosePresets: pediatricMode ? {} : DRUG_QUICK_DOSES,
      ranges: pediatricMode ? {} : DRUG_RANGES,
      canStartAsInfusion: canStartDrugAsInfusion(drugPick, INF_DRUGS),
      onConfirm: confirmDrug,
      onStartAsInfusion: startDrugAsInfusion,
      routes: DRUG_ROUTES,
      drugRoute,
      setDrugRoute,
      laConcentrations: pediatricMode ? {} : DRUG_LA_CONCENTRATIONS,
      drugConcentration,
      setDrugConcentration,
      drugCustomConcentration,
      setDrugCustomConcentration,
      drugFormulation,
      setDrugFormulation,
      drugRule,
      applyDrugSelection,
      baseProfiles: pediatricMode ? {} : DRUG_BASE_PROFILES,
      routeProfiles: pediatricMode ? {} : DRUG_ROUTE_PROFILES,
      doseCalcs: pediatricMode ? undefined : DRUG_DOSE_CALCS,
      patientWeightKg: preop?.weight ?? undefined,
      patientHeightCm: preop?.height ?? undefined,
      patientSex: preop?.sex ?? undefined,
      pediatricMode,
      pediatricDrugProfiles,
      pediatricDoseProfiles,
      patientAge: pediatricAgeFromPreop(preop),
      pediatricRulesSource,
      pediatricRulesCachedAt,
      pediatricRulesLoading,
      pediatricRulesError,
    },
    vitals: {
      visible: vitOpen,
      title: vitMode === "bp" ? "Blood pressure" : editingVitalId ? "Change vitals" : "Vitals",
      mode: vitMode,
      scanBusy: vitScanBusy,
      showEtco2: vitalVisibility.showEtco2,
      showTemperature: vitalVisibility.showTemperature,
      showGlucose: vitalVisibility.showGlucose,
      etco2Unit,
      temperatureUnit,
      sysRef: vSysRef,
      diaRef: vDiaRef,
      hrRef: vHRRef,
      spo2Ref: vSpO2Ref,
      etco2Ref: vEtco2Ref,
      tempRef: vTempRef,
      glucoseRef: vBglRef,
      systolic: vSys,
      diastolic: vDia,
      heartRate: vHR,
      spo2: vSpO2,
      etco2: vEtco2,
      temperature: vTemp,
      glucose: vBgl,
      onClose: () => { setVitOpen(false); setEditingVitalId(null) },
      onScan: scanVitalsFromCamera,
      onSystolicChange: v => setAndAdvance(v, setVSys, vDiaRef),
      onDiastolicChange: v => setAndAdvance(v, setVDia, vHRRef, 2),
      onHeartRateChange: vitMode === "bp" ? setVHR : v => setAndAdvance(v, setVHR, vSpO2Ref),
      onSpo2Change: v => setAndAdvance(v, setVSpO2, vitalVisibility.showEtco2 ? vEtco2Ref : vitalVisibility.showTemperature ? vTempRef : undefined),
      onEtco2Change: v => setAndAdvance(v, setVEtco2, vitalVisibility.showTemperature ? vTempRef : undefined, 2),
      onTemperatureChange: v => setAndAdvance(v, setVTemp, vitalVisibility.showGlucose ? vBglRef : undefined, 4),
      onGlucoseChange: setVBgl,
      onConfirm: confirmVitals,
    },
    infusion: {
      visible: infOpen,
      onClose: () => {
        setInfOpen(false); setInfDrug(null); setInfRate(""); setInfRoute(undefined)
        setInfConcentration(undefined); setInfCustomConcentration?.(undefined)
        setInfFormulation?.(undefined); setInfRule?.(undefined)
      },
      infDrugs: INF_DRUGS,
      favouriteNames: favouriteInfusions,
      // Navigation only, exactly as for boluses above: the pills carry a name
      // and a unit. The adult rate presets and ranges stay suppressed below.
      scenarios: INFUSION_SCENARIOS,
      ratePresets: pediatricMode ? {} : INFUSION_QUICK_RATES,
      infDrug,
      setInfDrug,
      infRate,
      setInfRate,
      onConfirm: confirmInfusion,
      routes: INFUSION_ROUTES,
      infRoute,
      setInfRoute,
      laConcentrations: pediatricMode ? {} : INFUSION_LA_CONCENTRATIONS,
      infConcentration,
      setInfConcentration,
      infCustomConcentration,
      setInfCustomConcentration,
      infFormulation,
      setInfFormulation,
      infRule,
      setInfRule,
      ranges: pediatricMode ? {} : INFUSION_RANGES,
      suggestedRates: pediatricMode ? {} : INFUSION_SUGGESTED_RATES,
      baseProfiles: pediatricMode ? {} : INFUSION_BASE_PROFILES,
      routeProfiles: pediatricMode ? {} : INFUSION_ROUTE_PROFILES,
      pediatricMode,
      pediatricInfusionProfiles,
      patientAge: pediatricAgeFromPreop(preop),
      patientWeightKg: preop?.weight ?? undefined,
    },
    infusionAction: {
      visible: infActOpen,
      onClose: () => { setInfActOpen(false); setInfActTgt(null); setInfActConcentration(undefined) },
      target: infActTgt,
      ratePresets: pediatricMode ? {} : INFUSION_QUICK_RATES,
      newRate: infActRate,
      setNewRate: setInfActRate,
      onChangeRate: changeRate,
      onStop: target => { stopInfusion(target); setInfActOpen(false); setInfActTgt(null) },
      laConcentrations: pediatricMode ? {} : INFUSION_LA_CONCENTRATIONS,
      newConcentration: infActConcentration,
      setNewConcentration: setInfActConcentration,
      ranges: pediatricMode ? {} : INFUSION_RANGES,
      routeProfiles: pediatricMode ? {} : INFUSION_ROUTE_PROFILES,
      pediatricMode,
    },
    fluid: {
      visible: flOpen,
      onClose: () => { setFlOpen(false); resetFluidDraft() },
      fluidList: FLUID_LIST,
      flFluid,
      setFlFluid,
      flVol,
      setFlVol,
      flEntryMode,
      setFlEntryMode,
      flRate,
      setFlRate,
      patientWeightKg: preop?.weight ?? undefined,
      onConfirm: confirmFluid,
      quickVolumes: FLUID_QUICK_VOLUMES,
      concentrations: FLUID_CONCENTRATIONS,
      defaultConcentrations: FLUID_DEFAULT_CONCENTRATIONS,
      flConcentration,
      setFlConcentration,
      flRoute,
      setFlRoute,
      setFlRule,
      pediatricFluidProfiles,
      patientAge: pediatricAgeFromPreop(preop),
      pediatricMode,
    },
    fluidEnd: {
      visible: flEndOpen,
      onClose: () => setFlEndOpen(false),
      target: flEndTarget,
      customAmount: flEndCustom,
      setCustomAmount: setFlEndCustom,
      newRate: flEndRate,
      setNewRate: setFlEndRate,
      onChangeRate: changeFluidRate,
      onConfirm: confirmFluidEnd,
    },
    agent: {
      visible: agOpen,
      onClose: () => { setAgOpen(false); setAgPick(null); setAgPercent(null) },
      agents: VOLATILE_AGENTS,
      agPick,
      setAgPick,
      activeAgent,
      onConfirm: confirmAgent,
      quickPercents: pediatricMode ? {} : AGENT_QUICK_PERCENTS,
      agPercent,
      setAgPercent,
      pediatricMode,
    },
  }
}
