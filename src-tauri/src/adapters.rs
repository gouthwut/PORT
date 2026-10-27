//! Compiled identities and paths. Catalog metadata never supplies executable instructions.
pub struct Adapter {
    pub id: &'static str,
    pub name: &'static str,
    pub data: &'static str,
    pub runtime: &'static str,
    pub executable: &'static str,
}
pub const BLOODBORNE: Adapter = Adapter {
    id: "bloodborne",
    name: "Bloodborne",
    data: "CUSA03173",
    runtime: "bbport-windows",
    executable: "Bloodborne.exe",
};
pub const SKATE3: Adapter = Adapter {
    id: "skate3",
    name: "Skate3",
    data: "game",
    runtime: "skate3-runtime",
    executable: "skate3.exe",
};
pub fn get(id: &str) -> Result<&'static Adapter, String> {
    match id {
        "bloodborne" => Ok(&BLOODBORNE),
        "skate3" => Ok(&SKATE3),
        _ => Err("Неизвестный адаптер установки".into()),
    }
}
