/* Local ABI shim. Upstream search/rules are deliberately unmodified. */
#include "../vendor/tetrarch/tetrarch.c"

static TtBoard board;
static TtResult result;

void sp_board(const uint8_t *squares, const int32_t *meta) {
    memset(&board, 0, sizeof(board));
    memcpy(board.sq, squares, NSQ);
    board.turn = (uint8_t)meta[16];
    board.mode = MODE_FFA;
    board.pawn_base_rank = 2;
    board.halfmove = meta[17];
    for (int c = 0; c < 4; c++) {
        board.points[c] = (uint16_t)meta[c];
        board.alive[c] = (uint8_t)meta[4+c];
        board.ck[c] = (uint8_t)meta[8+c];
        board.cq[c] = (uint8_t)meta[12+c];
        board.ep_target[c] = board.ep_victim[c] = board.kings[c] = -1;
    }
    for (int s = 0; s < NSQ; s++) {
        int p = board.sq[s];
        if (p && P.pc_type[p] == KING && P.pc_color[p] < 4)
            board.kings[P.pc_color[p]] = (int16_t)s;
    }
    board.key = tt_recompute_key(&board);
    tt_set_rep_history(NULL, 0);
}

int sp_load_net(const uint8_t *raw) {
    /* Header and exact length are validated in the typed adapter first. */
    TtNetView v;
    const uint8_t *p = raw + 44;
    memcpy(&v.version, raw + 4, 4);
    v.w1 = (const int16_t *)p; p += 3840 * 256 * 2;
    v.b1 = (const int32_t *)p; p += 256 * 4;
    v.w2 = (const int8_t *)p; p += 32 * 263;
    v.b2 = (const int32_t *)p; p += 32 * 4;
    v.w3 = (const int8_t *)p; p += 32 * 32;
    v.b3 = (const int32_t *)p; p += 32 * 4;
    v.w4 = (const int8_t *)p; p += 32;
    v.b4 = (const int32_t *)p;
    return tt_load_net(&v);
}
int sp_legal(uint32_t *out) { return tt_gen_legal(&board, out); }
void sp_search(int depth, double nodes) { tt_search(&board, depth, (uint64_t)nodes, &result); }
double sp_nodes(void) { return (double)result.nodes; }
uint32_t sp_best(void) { return result.best; }
int sp_score(void) { return result.score; }
int sp_aborted(void) { return result.aborted; }
int sp_eval(void) { return tt_eval(&board); }
int sp_pv(uint32_t first, uint32_t *out) { return tt_pv(&board, first, out, 32); }
