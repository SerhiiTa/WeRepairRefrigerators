"""Run ONLY against the disposable codex-refund112-test container.
Requires real local schema + 0143 and finance_v2_refund_events_local_test.sql fixtures.
No simplified tables or replaced refund/accounting functions are used.
"""
import subprocess
import time

CONTAINER = 'codex-refund112-test'
ACTOR = "select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);"

def command(db):
    assert db in ('refund112', 'refund112_old')
    return ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1']

def query(db, sql):
    result = subprocess.run(command(db), input=sql, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()

def concurrent_reserve_confirm(db, expect_deadlock=False, label='concurrent', kind='stripe'):
    # Session A pauses at the actual reservation entry lock boundary.
    a = subprocess.Popen(command(db), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    a.stdin.write("begin; set statement_timeout='12s'; set deadlock_timeout='200ms'; set application_name='refund112_reserve';" + ACTOR + "select id from service_requests where id=(select id from refund_test.ids where name='"+label+"_job') for update; select 'READY';\n")
    a.stdin.flush()
    while a.stdout.readline().strip() != 'READY':
        if a.poll() is not None:
            raise AssertionError(a.stderr.read())
    b = subprocess.Popen(command(db), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    confirm = ("select confirm_stripe_service_request_payment_refund_rpc((select id from refund_test.ids where name='"+label+"_refunded'),'re_"+label+"','evt_"+label+"');" if kind=='stripe' else ACTOR+"select confirm_service_request_payment_refund_rpc((select id from refund_test.ids where name='"+label+"_refunded'));").replace('_refunded', '_refund')
    b.stdin.write("set statement_timeout='12s'; set deadlock_timeout='200ms'; set application_name='refund112_confirm'; "+confirm+"\n")
    b.stdin.flush()
    deadline=time.monotonic()+8
    while query(db, "select count(*) from pg_stat_activity where datname=current_database() and application_name='refund112_confirm' and wait_event_type='Lock';") != '1':
        assert time.monotonic()<deadline, 'confirmation never reached lock barrier'
        time.sleep(.05)
    a.stdin.write("select refund_test.reserve('"+label+"',20,'"+label+"-second','"+kind+"'); commit;\n")
    a.stdin.flush()
    ao, ae = a.communicate(timeout=15)
    bo, be = b.communicate(timeout=15)
    if expect_deadlock:
        assert 'deadlock detected' in ae+be, (ao,ae,bo,be)
        print('PASS: original 0145 deadlock reproduced with real RPCs', flush=True)
    else:
        assert a.returncode==0 and b.returncode==0, (ao,ae,bo,be)
        print('PASS: corrected concurrent reservation + '+kind+' confirmation; both committed', flush=True)

def duplicate_confirmation():
    sql="set statement_timeout='12s'; select confirm_stripe_service_request_payment_refund_rpc((select id from refund_test.ids where name='duplicate_refund'),'re_duplicate','evt_duplicate');"
    processes=[subprocess.Popen(command('refund112'),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for _ in range(2)]
    for p in processes:
        p.stdin.write(sql+'\n'); p.stdin.flush()
    outputs=[]
    for p in processes:
        out,err=p.communicate(timeout=15)
        assert p.returncode==0,err
        outputs.append(out)
    assert sum('"idempotent": true' in out for out in outputs)==1,outputs
    print('PASS: concurrent duplicate confirmation; one idempotent response', flush=True)


def reservation_race():
    processes=[]
    for i in range(2):
        p=subprocess.Popen(command('refund112'),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        p.stdin.write(ACTOR+"set statement_timeout='12s'; select refund_test.reserve('reservation_race',60,'reservation-race-"+str(i)+"');\n")
        p.stdin.flush(); processes.append(p)
    errors=[]
    for p in processes:
        _,err=p.communicate(timeout=15)
        errors.append((p.returncode,err))
    assert sum(code==0 for code,_ in errors)==1,errors
    assert any('exceeds refundable payment balance' in err for _,err in errors),errors
    print('PASS: simultaneous reservations cannot over-refund',flush=True)

if __name__ == '__main__':
    import sys
    from pathlib import Path
    if '--run' not in sys.argv:
        raise SystemExit('Use --run to create and remove a disposable test container. Local schema only; no source data is copied.')
    root=Path(__file__).resolve().parent.parent
    def docker(*args, **kwargs):
        return subprocess.run(['docker',*args],check=True,text=True,capture_output=True,timeout=60,**kwargs)
    # Fixed, separate test container. Refuse to reuse any existing instance.
    docker('run','--name',CONTAINER,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','-d','public.ecr.aws/supabase/postgres:17.11.0.004')
    try:
        for _ in range(100):
            result=subprocess.run(['docker','exec',CONTAINER,'pg_isready','-h','127.0.0.1','-U','postgres'],capture_output=True)
            if result.returncode==0: break
            time.sleep(.1)
        else: raise AssertionError('test PostgreSQL failed to start')
        schema=docker('exec','supabase_db_WeRepairRefrigerators','pg_dump','-U','postgres','-d','postgres','--schema-only','--no-owner','--no-acl','--schema=public','--schema=auth').stdout
        docker('exec',CONTAINER,'psql','-U','postgres','-c','CREATE DATABASE refund112;')
        query('refund112', 'DROP SCHEMA public CASCADE; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions;')
        query('refund112',schema)
        foundation=(root/'supabase/migrations/0143_finance_v2_refund_financial_foundation_apply_ready.sql').read_text()
        migration=(root/'supabase/migrations/0145_finance_v2_refund_events_apply_ready.sql').read_text()
        query('refund112',foundation)
        local=(root/'supabase/finance_v2_refund_events_local_test.sql').read_text()
        setup,rest=local.split('-- APPLY MIGRATION AND CHECK HISTORY',1)
        history,rest=rest.split('-- REAPPLY MIGRATION',1)
        repeat,verify=rest.split('-- CONCURRENCY BARRIER',1)
        query('refund112',setup)
        if '--reproduce-old' in sys.argv:
            docker('exec',CONTAINER,'psql','-U','postgres','-c','CREATE DATABASE refund112_old TEMPLATE refund112;')
            query('refund112_old',migration)
            # Restore unmodified 0143 confirmation entry points, retaining event
            # Job/FK locks: reproduce the pre-fix lock graph with real RPCs.
            query('refund112_old',foundation)
            concurrent_reserve_confirm('refund112_old',True)
        query('refund112',migration)
        query('refund112',history)
        query('refund112',migration)
        query('refund112',repeat)
        print('PASS: eight historical refunds on one Job; repeated backfill; exact financial/event snapshots unchanged',flush=True)
        concurrent_reserve_confirm('refund112')
        concurrent_reserve_confirm('refund112',label='manual_race',kind='manual')
        duplicate_confirmation()
        reservation_race()
        query('refund112',verify)
        print('PASS: manual/full/partial, failed/canceled/pending, tenant authorization/RLS, privileges, repair timestamps, financial invariants and exactly-once events',flush=True)
    finally:
        docker('rm','-f',CONTAINER)
