from __future__ import annotations

SKELETON_ATTACH_BLOCKS = {
    "HT_Attach",
    "ST_Attach",
    "ST_Attach2",  # second seat-tube attach → defines movement axis
    "Motor_Attach",
    "SS_Attach",
    "CS_Attach",
    "END_Attach",
}

HEAD_TUBE_EXTRA_BLOCKS = {"PA", "PB"}


CATEGORY_PRIMARY_BLOCK = {
    "head_tube": "HT_Attach",
    "top_tube": "TT_Attach",
    "down_tube": "DT_Attach",
    "seat_tube": "ST_Attach",
    "motor_mount": "Motor_Attach",
    "seat_stay": "SS_Attach",
    "chain_stay": "CS_Attach",
    "fork_end": "END_Attach",
}

# For seat_tube: ST_Attach2 defines the second point of the movement axis
CATEGORY_SECONDARY_BLOCK = {
    "seat_tube": "ST_Attach2",
}

ALL_KNOWN_BLOCKS = (
    set(CATEGORY_PRIMARY_BLOCK.values())
    | HEAD_TUBE_EXTRA_BLOCKS
    | set(CATEGORY_SECONDARY_BLOCK.values())
    | SKELETON_ATTACH_BLOCKS  # includes ST_Attach2
)

VEHICLES = {
    "ASBGF-500": {
        "_folder": "ASBGF-500",
        "_skeleton": "ASBGF-500_skeleton.dwg",
        "head_tube": "ABWV-HT-177.dwg",
        "top_tube": "tt_abhc-tt-53x2t(53-37.1x490l)_asbgf-500.dwg",
        "down_tube": "DT ASBF-DT(ATR526)-3t_ASBGF-500.dwg",
        "seat_tube": "ST 35x1.8t_ASBGF-500.dwg",
        "motor_mount": "ASBF-NDE-A-ASBWV.dwg",
        "seat_stay": "SS VLWA-SS 31.8X1.4T(31.8-19X230L)-_ASBGF-500.dwg",
        "chain_stay": "CS ABWV-CS 31.8X2.2T(31.8-22.2X170L)x500L-_ASBGF.dwg",
        "fork_end": "GD122-340L(VLWA-ED-L).dwg",
    },
    "RAGTD-44": {
        "_folder": "RAGTD-44",
        "_skeleton": "RAGTD-44_skeleton.dwg",
        "head_tube": "HT 70x42x140L_RAGTD-44.dwg",
        "top_tube": "TT-RAYS-60-40-150x1.6t(60x40x150L)_RAGTD-44.dwg",
        "down_tube": "DT-LKB-0110_RAGTD-44.dwg",
        "seat_tube": "ST 50.8-35-200x1.6t(S18)_RAGTD-44.dwg",
        "motor_mount": "RAY-YA-IF.dwg",
        "seat_stay": "ss-18x22x2.0t-_ragtd-44.dwg",
        "chain_stay": "cs-18x35x2.0t-l_ragtd-44.dwg",
        "fork_end": "PXHB-ED-L.dwg",
    },
    "RESLA-450": {
        "_folder": "RESLA-450",
        "_skeleton": "RESLA-450_skeleton.dwg",
        "head_tube": "ht_70x43x160l_asslf.dwg",
        "top_tube": "asia-tt-1.8t_resla_450.dwg",
        "down_tube": "dt_awh_96x3.5t(atr279)_resla_450.dwg",
        "seat_tube": "st_50.8-35-200x1.6t(s18)_resla_450.dwg",
        "motor_mount": "awh-nde-a.dwg",
        "seat_stay": "SS ABLB-SS 22.2X1.8T(22.2-17.5X250L)-_RESLA_450.dwg",
        "chain_stay": "CS AWH-CS 31.8X1.8T(31.8-24X240L)-_RESLA_450.dwg",
        "fork_end": "awh-ed-r.dwg",
    },
    "RMBLC460": {
        "_folder": "RMBLC460",
        "_skeleton": "RMBLC460_skeleton.dwg",
        "head_tube": "rmgb-ht_62x54x150l.dwg",
        "top_tube": "rmgb-hfttb(1.8)t_rmblc460.dwg",
        "down_tube": "RMGB-HFDT-A(4-2.5)T_RMBLC460.dwg",
        "seat_tube": "st_40x2.7t_rmblc460.dwg",
        "motor_mount": "RMB6-NDE-A.dwg",
        "seat_stay": "rmgb-ss(1.8)t-_rmblc460.dwg",
        "chain_stay": "rmgb-csx1.8t-_rmblc460.dwg",
        "fork_end": "rmgb-rdp-u1.dwg",
    },
    "WB4GI8A_48": {
        "_folder": "WB4GI8A_48",
        "_skeleton": "WB4GI8A_48_skeleton.dwg",
        "head_tube": "win-htx155l(62x54)_wb4gi8a_48.dwg",
        "top_tube": "w47e-tt-1.6t_wb4gi8a_48.dwg",
        "down_tube": "w47e-dt-1.6t_wb4gi8a_48.dwg",
        "seat_tube": "st_35x1.8t_wb4gi8a_48.dwg",
        "motor_mount": "asel-g4.dwg",
        "seat_stay": "wb2gh8b-ss_25.4x1.6t(25.4-19x250l)-_wb4gi8a_48.dwg",
        "chain_stay": "wb2gh8b-cs_25.4x1.6t(25.4-16x230l)-_wb4gi8a_48.dwg",
        "fork_end": "W4ED-EDL-A.dwg",
    },
}
