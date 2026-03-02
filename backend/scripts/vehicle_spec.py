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
}
